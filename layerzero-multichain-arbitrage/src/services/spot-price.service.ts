import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AssetStatus, DeploymentScanStatus } from '../config/enums';
import { AppConf } from '../constants';
import { AssetEntity } from '../database/entities/asset.entity';
import { DeploymentEntity } from '../database/entities/deployment.entity';
import type {
  SpotAssetPriceDto,
  SpotMarketDto,
  SpotPricesResponseDto,
} from '../dto/spot-prices.dto';
import { DexScreenerClient } from '../lib';
import type { DexScreenerPair } from '../lib';

interface PriceTask {
  chainName: string;
  chainId: number;
  deployments: DeploymentEntity[];
}

interface PairCandidate {
  pair: DexScreenerPair;
  priceUsd: number;
  liquidityUsd: number;
}

@Injectable()
export class SpotPriceService {
  private readonly logger = new Logger(SpotPriceService.name);
  private readonly client = new DexScreenerClient({
    apiUrl: AppConf.prices.dexScreener.apiUrl,
    requestTimeoutMs: AppConf.prices.dexScreener.requestTimeoutMs,
  });

  constructor(
    @InjectRepository(AssetEntity)
    private readonly assetRepository: Repository<AssetEntity>,
  ) {}

  async list(): Promise<SpotPricesResponseDto> {
    const startedAt = Date.now();
    const assets = await this.assetRepository.find({
      where: { status: AssetStatus.VERIFIED },
      relations: { deployments: true },
      order: { symbol: 'ASC' },
    });
    const eligibleAssets = assets
      .map((asset) => ({
        asset,
        deployments: asset.deployments.filter(
          (deployment) =>
            deployment.scanStatus === DeploymentScanStatus.VERIFIED &&
            deployment.chainId !== null,
        ),
      }))
      .filter(({ deployments }) => deployments.length >= 2);
    const deployments = eligibleAssets.flatMap((item) => item.deployments);
    const tasks = this.buildTasks(deployments);
    const marketByDeployment = new Map<number, SpotMarketDto>();

    await this.mapLimit(
      tasks,
      AppConf.prices.dexScreener.scanConcurrency,
      async (task) => {
        try {
          const pairs = await this.client.tokenPairs(
            task.chainName,
            task.deployments.map((deployment) => this.tokenAddress(deployment)),
          );
          for (const deployment of task.deployments) {
            marketByDeployment.set(
              deployment.id,
              this.toMarket(deployment, pairs),
            );
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Spot price batch failed: chain=${task.chainName}, deployments=${task.deployments.length}, error=${message}`,
          );
          for (const deployment of task.deployments) {
            marketByDeployment.set(
              deployment.id,
              this.failedMarket(deployment, message),
            );
          }
        }
      },
    );

    const responseAssets = eligibleAssets.map(({ asset, deployments }) =>
      this.toAsset(asset, deployments, marketByDeployment),
    );
    responseAssets.sort((left, right) => {
      if (left.spreadPct === null) return right.spreadPct === null ? 0 : 1;
      if (right.spreadPct === null) return -1;
      return right.spreadPct - left.spreadPct;
    });
    const chains = [
      ...new Map(
        deployments.map((deployment) => [deployment.chainName, deployment]),
      ).values(),
    ]
      .map((deployment) => ({
        chainName: deployment.chainName,
        chainId: deployment.chainId!,
      }))
      .sort((left, right) => left.chainId - right.chainId);
    const pricedDeployments = responseAssets.reduce(
      (total, asset) => total + asset.pricedChains,
      0,
    );
    const comparable = responseAssets.filter(
      (asset) => asset.spreadPct !== null,
    );
    const observedAt = new Date().toISOString();

    this.logger.log(
      `Spot price scan completed: assets=${responseAssets.length}, deployments=${deployments.length}, priced=${pricedDeployments}, durationMs=${Date.now() - startedAt}`,
    );
    return {
      source: 'dexscreener',
      observedAt,
      chains,
      summary: {
        assets: responseAssets.length,
        deployments: deployments.length,
        pricedDeployments,
        missingDeployments: deployments.length - pricedDeployments,
        comparableAssets: comparable.length,
        maxSpreadPct:
          comparable.length === 0
            ? null
            : Math.max(...comparable.map((asset) => asset.spreadPct!)),
      },
      assets: responseAssets,
    };
  }

  private buildTasks(deployments: DeploymentEntity[]): PriceTask[] {
    const byChain = new Map<string, DeploymentEntity[]>();
    for (const deployment of deployments) {
      const group = byChain.get(deployment.chainName) ?? [];
      group.push(deployment);
      byChain.set(deployment.chainName, group);
    }

    return [...byChain.entries()].flatMap(([chainName, items]) => {
      const tasks: PriceTask[] = [];
      for (
        let index = 0;
        index < items.length;
        index += AppConf.prices.dexScreener.batchSize
      ) {
        tasks.push({
          chainName,
          chainId: items[index].chainId!,
          deployments: items.slice(
            index,
            index + AppConf.prices.dexScreener.batchSize,
          ),
        });
      }
      return tasks;
    });
  }

  private toAsset(
    asset: AssetEntity,
    deployments: DeploymentEntity[],
    marketByDeployment: Map<number, SpotMarketDto>,
  ): SpotAssetPriceDto {
    const markets = deployments
      .map((deployment) => marketByDeployment.get(deployment.id)!)
      .sort((left, right) => left.chainId - right.chainId);
    const priced = markets.filter(
      (market): market is SpotMarketDto & { priceUsd: string } =>
        market.status === 'priced' && market.priceUsd !== null,
    );
    const comparable = priced.filter((market) => market.comparable);
    const ordered = [...comparable].sort(
      (left, right) => Number(left.priceUsd) - Number(right.priceUsd),
    );
    const low = ordered[0] ?? null;
    const high = ordered.at(-1) ?? null;
    const lowPrice = low ? Number(low.priceUsd) : null;
    const highPrice = high ? Number(high.priceUsd) : null;
    const spreadPct =
      lowPrice !== null &&
      highPrice !== null &&
      lowPrice > 0 &&
      comparable.length >= 2
        ? ((highPrice - lowPrice) / lowPrice) * 100
        : null;

    return {
      assetId: asset.id,
      name: asset.name,
      symbol: asset.symbol,
      markets,
      pricedChains: priced.length,
      comparableChains: comparable.length,
      lowChainName: low?.chainName ?? null,
      highChainName: high?.chainName ?? null,
      lowPriceUsd: low?.priceUsd ?? null,
      highPriceUsd: high?.priceUsd ?? null,
      spreadPct,
    };
  }

  private toMarket(
    deployment: DeploymentEntity,
    pairs: DexScreenerPair[],
  ): SpotMarketDto {
    const address = this.tokenAddress(deployment);
    const candidate = this.selectPair(pairs, address);
    if (!candidate) {
      return {
        ...this.marketIdentity(deployment),
        status: 'no_pool',
        priceUsd: null,
        liquidityUsd: null,
        volume24hUsd: null,
        priceChange24hPct: null,
        dexId: null,
        pairAddress: null,
        quoteSymbol: null,
        pairUrl: null,
        comparable: false,
        error: null,
      };
    }

    const tokenIsBase =
      candidate.pair.baseToken.address.toLowerCase() === address.toLowerCase();
    return {
      ...this.marketIdentity(deployment),
      status: 'priced',
      priceUsd: String(candidate.priceUsd),
      liquidityUsd: String(candidate.liquidityUsd),
      volume24hUsd:
        candidate.pair.volume?.h24 === undefined
          ? null
          : String(candidate.pair.volume.h24),
      priceChange24hPct: candidate.pair.priceChange?.h24 ?? null,
      dexId: candidate.pair.dexId,
      pairAddress: candidate.pair.pairAddress,
      quoteSymbol: tokenIsBase
        ? candidate.pair.quoteToken.symbol
        : candidate.pair.baseToken.symbol,
      pairUrl: candidate.pair.url,
      comparable:
        candidate.liquidityUsd >=
        AppConf.prices.dexScreener.minComparableLiquidityUsd,
      error: null,
    };
  }

  private failedMarket(
    deployment: DeploymentEntity,
    error: string,
  ): SpotMarketDto {
    return {
      ...this.marketIdentity(deployment),
      status: 'failed',
      priceUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      priceChange24hPct: null,
      dexId: null,
      pairAddress: null,
      quoteSymbol: null,
      pairUrl: null,
      comparable: false,
      error,
    };
  }

  private marketIdentity(deployment: DeploymentEntity) {
    return {
      deploymentId: deployment.id,
      chainName: deployment.chainName,
      chainId: deployment.chainId!,
      tokenAddress: this.tokenAddress(deployment),
    };
  }

  private selectPair(
    pairs: DexScreenerPair[],
    tokenAddress: string,
  ): PairCandidate | null {
    const normalized = tokenAddress.toLowerCase();
    const candidates = pairs
      .map<PairCandidate | null>((pair) => {
        const baseMatches = pair.baseToken.address.toLowerCase() === normalized;
        const quoteMatches =
          pair.quoteToken.address.toLowerCase() === normalized;
        if (!baseMatches && !quoteMatches) return null;
        const basePriceUsd = Number(pair.priceUsd);
        const priceNative = Number(pair.priceNative);
        const priceUsd = baseMatches
          ? basePriceUsd
          : basePriceUsd / priceNative;
        if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
        return {
          pair,
          priceUsd,
          liquidityUsd: Math.max(0, pair.liquidity?.usd ?? 0),
        };
      })
      .filter((candidate): candidate is PairCandidate => candidate !== null);

    candidates.sort((left, right) => right.liquidityUsd - left.liquidityUsd);
    return candidates[0] ?? null;
  }

  private tokenAddress(deployment: DeploymentEntity): string {
    return deployment.tokenAddress ?? deployment.oftAddress;
  }

  private async mapLimit<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (cursor < items.length) {
          const item = items[cursor];
          cursor += 1;
          await worker(item);
        }
      },
    );
    await Promise.all(workers);
  }
}
