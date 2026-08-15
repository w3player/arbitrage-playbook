import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AssetStatus,
  DeploymentScanStatus,
  MarketQuoteSide,
  MarketQuoteStatus,
} from '../config/enums';
import { AppConf } from '../constants';
import { AssetEntity } from '../database/entities/asset.entity';
import { DeploymentEntity } from '../database/entities/deployment.entity';
import { MarketQuoteEntity } from '../database/entities/market-quote.entity';
import type {
  PriceScanStatusDto,
  PriceScanSummaryDto,
} from '../dto/prices.dto';
import { LifiQuoteClient, parseDecimal, quoteCostUsdMicros } from '../lib';
import type { LifiQuoteRequest, LifiQuoteResult } from '../lib';

interface PriceChainConfig {
  chainId: number;
  settlementSymbol: string;
  settlementAddress: string;
  settlementDecimals: number;
}

interface QuoteTask {
  deployment: DeploymentEntity;
  side: MarketQuoteSide.BUY | MarketQuoteSide.SELL;
  tokenAmount: bigint;
}

@Injectable()
export class PriceScanService {
  private readonly logger = new Logger(PriceScanService.name);
  private readonly chains: Record<string, PriceChainConfig>;
  private readonly quoteClient: LifiQuoteClient;
  private readonly hasApiKey: boolean;
  private rateLimited = false;
  private activeScan: Promise<PriceScanSummaryDto> | null = null;
  private status: PriceScanStatusDto = {
    state: 'idle',
    runId: null,
    currentAsset: null,
    startedAt: null,
    completedAt: null,
    summary: null,
    error: null,
  };

  constructor(
    @InjectRepository(AssetEntity)
    private readonly assetRepository: Repository<AssetEntity>,
    @InjectRepository(MarketQuoteEntity)
    private readonly quoteRepository: Repository<MarketQuoteEntity>,
    configService: ConfigService,
  ) {
    this.chains = AppConf.prices.lifi.chains;
    const apiKey = configService.get<string>('LIFI_API_KEY');
    this.hasApiKey = !!apiKey;
    this.quoteClient = new LifiQuoteClient({
      apiKey,
      integrator: AppConf.prices.lifi.integrator,
      fromAddress: AppConf.prices.lifi.fromAddress,
      requestTimeoutMs: AppConf.prices.lifi.requestTimeoutMs,
      slippage: AppConf.prices.lifi.slippage,
    });
  }

  triggerScan(assetId?: number): { started: boolean; runId: string | null } {
    if (this.activeScan) {
      return { started: false, runId: this.status.runId };
    }
    const runId = randomUUID();
    void this.scan(runId, assetId).catch(() => undefined);
    return { started: true, runId };
  }

  getStatus(): PriceScanStatusDto {
    return {
      ...this.status,
      summary: this.status.summary ? { ...this.status.summary } : null,
    };
  }

  isAuthenticated(): boolean {
    return this.hasApiKey;
  }

  scan(runId = randomUUID(), assetId?: number): Promise<PriceScanSummaryDto> {
    if (this.activeScan) {
      return this.activeScan;
    }

    const startedAt = Date.now();
    this.rateLimited = false;
    this.status = {
      state: 'running',
      runId,
      currentAsset: null,
      startedAt: new Date(startedAt).toISOString(),
      completedAt: null,
      summary: null,
      error: null,
    };
    this.logger.log(
      `Cross-chain price scan started: runId=${runId}, mode=${this.hasApiKey ? 'authenticated' : 'anonymous_incremental'}, target=${assetId ?? 'all'}`,
    );

    this.activeScan = this.executeScan(runId, assetId)
      .then((summary) => {
        this.status = {
          ...this.status,
          state: 'idle',
          currentAsset: null,
          completedAt: new Date().toISOString(),
          summary,
          error: null,
        };
        this.logger.log(
          `Cross-chain price scan completed: runId=${runId}, durationMs=${Date.now() - startedAt}, summary=${JSON.stringify(summary)}`,
        );
        return summary;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.status = {
          ...this.status,
          state: 'failed',
          currentAsset: null,
          completedAt: new Date().toISOString(),
          error: message,
        };
        this.logger.error(
          `Cross-chain price scan failed: runId=${runId}, error=${message}`,
        );
        throw error;
      })
      .finally(() => {
        this.activeScan = null;
      });

    return this.activeScan;
  }

  private async executeScan(
    runId: string,
    assetId?: number,
  ): Promise<PriceScanSummaryDto> {
    const allAssets = await this.assetRepository.find({
      where:
        assetId === undefined
          ? { status: AssetStatus.VERIFIED }
          : { id: assetId, status: AssetStatus.VERIFIED },
      relations: { deployments: true },
      order: { symbol: 'ASC' },
    });
    const assets =
      assetId !== undefined || this.hasApiKey
        ? allAssets
        : await this.selectAnonymousBatch(allAssets);
    const summary: PriceScanSummaryDto = {
      assets: assets.length,
      completedAssets: 0,
      deployments: 0,
      succeededQuotes: 0,
      failedQuotes: 0,
      crosschainSpreads: 0,
    };
    this.status = { ...this.status, summary: { ...summary } };

    for (const asset of assets) {
      this.status = { ...this.status, currentAsset: asset.symbol };
      const pairs = this.activePairs(asset.deployments);
      const deployments = this.uniqueDeployments(pairs);
      if (pairs.length === 0 || deployments.length < 2) {
        summary.completedAssets += 1;
        this.status = { ...this.status, summary: { ...summary } };
        continue;
      }
      summary.deployments += deployments.length;

      const sharedDecimals = deployments[0].sharedDecimals;
      if (
        sharedDecimals === null ||
        deployments.some(
          (deployment) => deployment.sharedDecimals !== sharedDecimals,
        )
      ) {
        summary.failedQuotes += deployments.length * 2;
        summary.completedAssets += 1;
        this.logger.warn(
          `Price scan skipped ${asset.symbol}: shared decimals mismatch`,
        );
        this.status = { ...this.status, summary: { ...summary } };
        continue;
      }

      const sharedAmount = await this.discoverSharedAmount(
        runId,
        asset.id,
        deployments,
        sharedDecimals,
      );
      if (sharedAmount === null || sharedAmount === 0n) {
        summary.failedQuotes += 1;
        summary.completedAssets += 1;
        this.logger.warn(
          `Price scan skipped ${asset.symbol}: no LI.FI probe route`,
        );
        this.status = { ...this.status, summary: { ...summary } };
        if (this.rateLimited) {
          this.logger.warn(
            `Anonymous LI.FI rate limit reached; stopping runId=${runId}`,
          );
          break;
        }
        continue;
      }

      const tasks = deployments.flatMap<QuoteTask>((deployment) => {
        const tokenAmount = this.fromSharedAmount(
          sharedAmount,
          sharedDecimals,
          deployment.localDecimals!,
        );
        return [
          { deployment, side: MarketQuoteSide.BUY, tokenAmount },
          { deployment, side: MarketQuoteSide.SELL, tokenAmount },
        ];
      });
      const quotes = await this.mapLimit(
        tasks,
        this.hasApiKey
          ? AppConf.prices.scanConcurrency
          : AppConf.prices.anonymousScanConcurrency,
        (task) => this.quoteDeployment(runId, asset.id, task),
      );
      const successful = quotes.filter(
        (quote) => quote.status === MarketQuoteStatus.SUCCESS,
      );
      summary.succeededQuotes += successful.length;
      summary.failedQuotes += quotes.length - successful.length;
      summary.crosschainSpreads += this.countCompleteDirections(
        pairs,
        successful,
      );
      summary.completedAssets += 1;
      this.status = { ...this.status, summary: { ...summary } };
      this.logger.log(
        `Price scan progress: ${summary.completedAssets}/${summary.assets}, asset=${asset.symbol}, quotes=${successful.length}/${quotes.length}, spreads=${summary.crosschainSpreads}`,
      );
      if (this.rateLimited) {
        this.logger.warn(
          `Anonymous LI.FI rate limit reached; stopping runId=${runId}`,
        );
        break;
      }
    }

    summary.succeededQuotes = await this.quoteRepository.count({
      where: { runId, status: MarketQuoteStatus.SUCCESS },
    });
    summary.failedQuotes = await this.quoteRepository.count({
      where: { runId, status: MarketQuoteStatus.FAILED },
    });
    return summary;
  }

  private activePairs(
    deployments: DeploymentEntity[],
  ): Array<[DeploymentEntity, DeploymentEntity]> {
    const eligible = deployments.filter(
      (deployment) =>
        deployment.scanStatus === DeploymentScanStatus.VERIFIED &&
        deployment.paused !== true &&
        deployment.chainId !== null &&
        deployment.endpointId !== null &&
        deployment.localDecimals !== null &&
        deployment.sharedDecimals !== null &&
        !!this.chains[deployment.chainName] &&
        !!this.tradeTokenAddress(deployment),
    );
    const pairs: Array<[DeploymentEntity, DeploymentEntity]> = [];
    for (let leftIndex = 0; leftIndex < eligible.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < eligible.length;
        rightIndex += 1
      ) {
        const left = eligible[leftIndex];
        const right = eligible[rightIndex];
        if (
          this.hasActivePeer(left, right) &&
          this.hasActivePeer(right, left)
        ) {
          pairs.push([left, right]);
        }
      }
    }
    return pairs;
  }

  private hasActivePeer(
    source: DeploymentEntity,
    target: DeploymentEntity,
  ): boolean {
    return Object.values(source.peers ?? {}).some(
      (peer) =>
        peer.endpointId === target.endpointId && peer.status === 'active',
    );
  }

  private uniqueDeployments(
    pairs: Array<[DeploymentEntity, DeploymentEntity]>,
  ): DeploymentEntity[] {
    return [
      ...new Map(
        pairs
          .flatMap(([left, right]) => [left, right])
          .map((item) => [item.id, item]),
      ).values(),
    ];
  }

  private async discoverSharedAmount(
    runId: string,
    assetId: number,
    deployments: DeploymentEntity[],
    sharedDecimals: number,
  ): Promise<bigint | null> {
    for (const deployment of deployments) {
      if (this.rateLimited) return null;
      const chain = this.chains[deployment.chainName];
      const result = await this.quoteClient.quote({
        chainId: deployment.chainId!,
        fromToken: chain.settlementAddress,
        toToken: this.tradeTokenAddress(deployment)!,
        amount: parseDecimal(
          AppConf.prices.targetSettlementAmount,
          chain.settlementDecimals,
        ).toString(),
        mode: 'exact-input',
      });
      const quote = await this.saveQuote({
        runId,
        assetId,
        deployment,
        side: MarketQuoteSide.PROBE,
        tokenAmount: null,
        result,
      });
      if (result.error?.code === '1005') {
        this.rateLimited = true;
        return null;
      }
      if (quote.status === MarketQuoteStatus.SUCCESS && quote.toAmountMinRaw) {
        return this.toSharedAmount(
          BigInt(quote.toAmountMinRaw),
          deployment.localDecimals!,
          sharedDecimals,
        );
      }
    }
    return null;
  }

  private async quoteDeployment(
    runId: string,
    assetId: number,
    task: QuoteTask,
  ): Promise<MarketQuoteEntity> {
    const chain = this.chains[task.deployment.chainName];
    const tokenAddress = this.tradeTokenAddress(task.deployment)!;
    const request: LifiQuoteRequest =
      task.side === MarketQuoteSide.BUY
        ? {
            chainId: task.deployment.chainId!,
            fromToken: chain.settlementAddress,
            toToken: tokenAddress,
            amount: task.tokenAmount.toString(),
            mode: 'exact-output',
          }
        : {
            chainId: task.deployment.chainId!,
            fromToken: tokenAddress,
            toToken: chain.settlementAddress,
            amount: task.tokenAmount.toString(),
            mode: 'exact-input',
          };
    const result = this.rateLimited
      ? this.rateLimitResult()
      : await this.quoteClient.quote(request);
    if (result.error?.code === '1005') {
      this.rateLimited = true;
    }
    return this.saveQuote({
      runId,
      assetId,
      deployment: task.deployment,
      side: task.side,
      tokenAmount: task.tokenAmount,
      result,
    });
  }

  private async saveQuote(input: {
    runId: string;
    assetId: number;
    deployment: DeploymentEntity;
    side: MarketQuoteSide;
    tokenAmount: bigint | null;
    result: LifiQuoteResult;
  }): Promise<MarketQuoteEntity> {
    const chain = this.chains[input.deployment.chainName];
    const estimate = input.result.response?.estimate;
    const success = !!estimate && !input.result.error;
    const entity = this.quoteRepository.create({
      runId: input.runId,
      assetId: input.assetId,
      deploymentId: input.deployment.id,
      chainName: input.deployment.chainName,
      chainId: input.deployment.chainId!,
      side: input.side,
      tradeTokenAddress: this.tradeTokenAddress(input.deployment)!,
      settlementTokenAddress: chain.settlementAddress,
      settlementSymbol: chain.settlementSymbol,
      tokenAmountRaw:
        input.tokenAmount?.toString() ?? estimate?.toAmountMin ?? null,
      tokenDecimals: input.deployment.localDecimals!,
      settlementDecimals: chain.settlementDecimals,
      fromAmountRaw: estimate?.fromAmount ?? null,
      toAmountRaw: estimate?.toAmount ?? null,
      toAmountMinRaw: estimate?.toAmountMin ?? estimate?.toAmount ?? null,
      gasCostUsdMicros: quoteCostUsdMicros(estimate?.gasCosts).toString(),
      includedFeeUsdMicros: quoteCostUsdMicros(
        estimate?.feeCosts,
        true,
      ).toString(),
      extraFeeUsdMicros: quoteCostUsdMicros(
        estimate?.feeCosts,
        false,
      ).toString(),
      tool: input.result.response?.tool ?? null,
      requestedAt: input.result.requestedAt,
      receivedAt: input.result.receivedAt,
      durationMs: input.result.durationMs,
      validUntil: new Date(
        input.result.receivedAt.getTime() + AppConf.prices.quoteValidityMs,
      ),
      status: success ? MarketQuoteStatus.SUCCESS : MarketQuoteStatus.FAILED,
      errorCode: input.result.error?.code ?? null,
      errorMessage: input.result.error?.message ?? null,
      raw: this.jsonRecord(
        input.result.response ?? { error: input.result.error ?? null },
      ),
    });
    return this.quoteRepository.save(entity);
  }

  private tradeTokenAddress(deployment: DeploymentEntity): string | null {
    return deployment.tokenAddress ?? deployment.oftAddress ?? null;
  }

  private toSharedAmount(
    localAmount: bigint,
    localDecimals: number,
    sharedDecimals: number,
  ): bigint {
    if (localDecimals >= sharedDecimals) {
      return localAmount / 10n ** BigInt(localDecimals - sharedDecimals);
    }
    return localAmount * 10n ** BigInt(sharedDecimals - localDecimals);
  }

  private fromSharedAmount(
    sharedAmount: bigint,
    sharedDecimals: number,
    localDecimals: number,
  ): bigint {
    if (localDecimals >= sharedDecimals) {
      return sharedAmount * 10n ** BigInt(localDecimals - sharedDecimals);
    }
    return sharedAmount / 10n ** BigInt(sharedDecimals - localDecimals);
  }

  private countCompleteDirections(
    pairs: Array<[DeploymentEntity, DeploymentEntity]>,
    quotes: MarketQuoteEntity[],
  ): number {
    const keys = new Set(
      quotes.map((quote) => `${quote.deploymentId}:${quote.side}`),
    );
    return pairs.reduce((total, [left, right]) => {
      const leftToRight =
        keys.has(`${left.id}:${MarketQuoteSide.BUY}`) &&
        keys.has(`${right.id}:${MarketQuoteSide.SELL}`);
      const rightToLeft =
        keys.has(`${right.id}:${MarketQuoteSide.BUY}`) &&
        keys.has(`${left.id}:${MarketQuoteSide.SELL}`);
      return total + Number(leftToRight) + Number(rightToLeft);
    }, 0);
  }

  private jsonRecord(value: unknown): Record<string, unknown> {
    return JSON.parse(
      JSON.stringify(value, (_, item: unknown) =>
        typeof item === 'bigint' ? item.toString() : item,
      ),
    ) as Record<string, unknown>;
  }

  private async selectAnonymousBatch(
    assets: AssetEntity[],
  ): Promise<AssetEntity[]> {
    const rows = await this.quoteRepository
      .createQueryBuilder('quote')
      .select('quote.assetId', 'assetId')
      .addSelect('MAX(quote.receivedAt)', 'lastReceivedAt')
      .groupBy('quote.assetId')
      .getRawMany<{ assetId: number; lastReceivedAt: string }>();
    const lastReceivedByAsset = new Map(
      rows.map((row) => [Number(row.assetId), Date.parse(row.lastReceivedAt)]),
    );
    return assets
      .filter((asset) => this.activePairs(asset.deployments).length > 0)
      .sort(
        (left, right) =>
          (lastReceivedByAsset.get(left.id) ?? 0) -
          (lastReceivedByAsset.get(right.id) ?? 0),
      )
      .slice(0, AppConf.prices.anonymousAssetBatchSize);
  }

  private rateLimitResult(): LifiQuoteResult {
    const now = new Date();
    return {
      requestedAt: now,
      receivedAt: now,
      durationMs: 0,
      error: {
        code: '1005',
        message: 'LI.FI anonymous quote limit reached; retry in a later batch',
      },
    };
  }

  private async mapLimit<T, R>(
    items: T[],
    limit: number,
    mapper: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (nextIndex < items.length) {
          const index = nextIndex;
          nextIndex += 1;
          results[index] = await mapper(items[index]);
        }
      },
    );
    await Promise.all(workers);
    return results;
  }
}
