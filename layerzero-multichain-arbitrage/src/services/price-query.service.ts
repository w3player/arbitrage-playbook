import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  DeploymentScanStatus,
  MarketQuoteSide,
  MarketQuoteStatus,
} from '../config/enums';
import { AppConf } from '../constants';
import { AssetEntity } from '../database/entities/asset.entity';
import { DeploymentEntity } from '../database/entities/deployment.entity';
import { MarketQuoteEntity } from '../database/entities/market-quote.entity';
import type {
  CrosschainSpreadDto,
  PriceFailureDto,
  PriceLegDto,
  PricesResponseDto,
} from '../dto/prices.dto';

interface SpreadWithSortValue {
  spread: CrosschainSpreadDto;
  directProfit: bigint;
}

@Injectable()
export class PriceQueryService {
  constructor(
    @InjectRepository(AssetEntity)
    private readonly assetRepository: Repository<AssetEntity>,
    @InjectRepository(MarketQuoteEntity)
    private readonly quoteRepository: Repository<MarketQuoteEntity>,
  ) {}

  async list(): Promise<PricesResponseDto> {
    const [latest] = await this.quoteRepository.find({
      order: { id: 'DESC' },
      take: 1,
    });
    if (!latest) {
      return {
        summary: {
          runId: null,
          pricedAssets: 0,
          crosschainSpreads: 0,
          positiveSpreads: 0,
          failedQuotes: 0,
          updatedAt: null,
        },
        spreads: [],
        failures: [],
      };
    }

    const quotes = await this.quoteRepository.find({
      where: { runId: latest.runId },
      order: { receivedAt: 'DESC' },
    });
    const assetIds = [...new Set(quotes.map((quote) => quote.assetId))];
    const assets = await this.assetRepository.find({
      where: { id: In(assetIds) },
      relations: { deployments: true },
    });
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const successful = new Map<string, MarketQuoteEntity>();
    for (const quote of quotes) {
      if (
        quote.status !== MarketQuoteStatus.SUCCESS ||
        quote.side === MarketQuoteSide.PROBE
      ) {
        continue;
      }
      const key = `${quote.deploymentId}:${quote.side}`;
      if (!successful.has(key)) {
        successful.set(key, quote);
      }
    }

    const spreads: SpreadWithSortValue[] = [];
    for (const asset of assets) {
      for (const [left, right] of this.activePairs(asset.deployments)) {
        const leftToRight = this.createSpread(asset, left, right, successful);
        if (leftToRight) spreads.push(leftToRight);
        const rightToLeft = this.createSpread(asset, right, left, successful);
        if (rightToLeft) spreads.push(rightToLeft);
      }
    }
    spreads.sort((left, right) =>
      left.directProfit === right.directProfit
        ? 0
        : left.directProfit > right.directProfit
          ? -1
          : 1,
    );

    const failures = quotes
      .filter((quote) => quote.status === MarketQuoteStatus.FAILED)
      .slice(0, 100)
      .map<PriceFailureDto>((quote) => ({
        assetId: quote.assetId,
        symbol: assetsById.get(quote.assetId)?.symbol ?? 'UNKNOWN',
        deploymentId: quote.deploymentId,
        chainName: quote.chainName,
        side: quote.side,
        code: quote.errorCode ?? 'UNKNOWN',
        message: quote.errorMessage ?? 'LI.FI quote failed',
        observedAt: quote.receivedAt.toISOString(),
      }));
    const spreadDtos = spreads.map((item) => item.spread);
    const updatedAt = quotes.reduce<Date | null>(
      (value, quote) =>
        !value || quote.receivedAt > value ? quote.receivedAt : value,
      null,
    );

    return {
      summary: {
        runId: latest.runId,
        pricedAssets: new Set(spreadDtos.map((spread) => spread.assetId)).size,
        crosschainSpreads: spreadDtos.length,
        positiveSpreads: spreadDtos.filter(
          (spread) => spread.status === 'positive',
        ).length,
        failedQuotes: failures.length,
        updatedAt: updatedAt?.toISOString() ?? null,
      },
      spreads: spreadDtos,
      failures,
    };
  }

  private createSpread(
    asset: AssetEntity,
    buyDeployment: DeploymentEntity,
    sellDeployment: DeploymentEntity,
    quotes: Map<string, MarketQuoteEntity>,
  ): SpreadWithSortValue | null {
    const buy = quotes.get(`${buyDeployment.id}:${MarketQuoteSide.BUY}`);
    const sell = quotes.get(`${sellDeployment.id}:${MarketQuoteSide.SELL}`);
    if (
      !buy?.fromAmountRaw ||
      !sell?.toAmountMinRaw ||
      !buy.tokenAmountRaw ||
      !sell.tokenAmountRaw ||
      buy.settlementSymbol !== sell.settlementSymbol
    ) {
      return null;
    }
    const buyShared = this.toSharedAmount(
      BigInt(buy.tokenAmountRaw),
      buy.tokenDecimals,
      buyDeployment.sharedDecimals!,
    );
    const sellShared = this.toSharedAmount(
      BigInt(sell.tokenAmountRaw),
      sell.tokenDecimals,
      sellDeployment.sharedDecimals!,
    );
    if (buyShared !== sellShared) {
      return null;
    }

    const buyUsd = this.toUsdMicros(
      BigInt(buy.fromAmountRaw),
      buy.settlementDecimals,
    );
    const sellUsd = this.toUsdMicros(
      BigInt(sell.toAmountMinRaw),
      sell.settlementDecimals,
    );
    if (buyUsd <= 0n) return null;
    const grossProfit = sellUsd - buyUsd;
    const directCost =
      BigInt(buy.gasCostUsdMicros) +
      BigInt(sell.gasCostUsdMicros) +
      BigInt(buy.extraFeeUsdMicros) +
      BigInt(sell.extraFeeUsdMicros);
    const directProfit = grossProfit - directCost;
    const observedAt =
      buy.receivedAt > sell.receivedAt ? buy.receivedAt : sell.receivedAt;
    const stale =
      buy.validUntil.getTime() < Date.now() ||
      sell.validUntil.getTime() < Date.now();

    return {
      directProfit,
      spread: {
        id: `${buy.runId}:${asset.id}:${buyDeployment.id}:${sellDeployment.id}`,
        runId: buy.runId,
        assetId: asset.id,
        name: asset.name,
        symbol: asset.symbol,
        tokenAmount: this.formatDecimal(
          BigInt(buy.tokenAmountRaw),
          buy.tokenDecimals,
          8,
        ),
        sharedDecimals: buyDeployment.sharedDecimals!,
        buy: this.toLeg(buy, buyUsd),
        sell: this.toLeg(sell, sellUsd),
        grossProfitUsd: this.formatSignedUsd(grossProfit),
        grossSpreadBps: this.basisPoints(grossProfit, buyUsd),
        directCostUsd: this.formatUsd(directCost),
        directProfitUsd: this.formatSignedUsd(directProfit),
        directSpreadBps: this.basisPoints(directProfit, buyUsd),
        quoteSkewMs: Math.abs(
          buy.receivedAt.getTime() - sell.receivedAt.getTime(),
        ),
        observedAt: observedAt.toISOString(),
        status: stale ? 'stale' : directProfit > 0n ? 'positive' : 'negative',
      },
    };
  }

  private toLeg(quote: MarketQuoteEntity, amountUsd: bigint): PriceLegDto {
    const tokenAmount = BigInt(quote.tokenAmountRaw!);
    const unitPrice =
      tokenAmount === 0n
        ? 0n
        : (amountUsd * 10n ** BigInt(quote.tokenDecimals)) / tokenAmount;
    return {
      deploymentId: quote.deploymentId,
      chainName: quote.chainName,
      chainId: quote.chainId,
      tokenAddress: quote.tradeTokenAddress,
      settlementSymbol: quote.settlementSymbol,
      settlementAddress: quote.settlementTokenAddress,
      amountUsd: this.formatUsd(amountUsd),
      unitPriceUsd: this.formatUsd(unitPrice),
      gasUsd: this.formatUsd(BigInt(quote.gasCostUsdMicros)),
      extraFeeUsd: this.formatUsd(BigInt(quote.extraFeeUsdMicros)),
      tool: quote.tool ?? 'unknown',
      quotedAt: quote.receivedAt.toISOString(),
      validUntil: quote.validUntil.toISOString(),
      durationMs: quote.durationMs,
    };
  }

  private activePairs(
    deployments: DeploymentEntity[],
  ): Array<[DeploymentEntity, DeploymentEntity]> {
    const eligible = deployments.filter(
      (deployment) =>
        deployment.scanStatus === DeploymentScanStatus.VERIFIED &&
        deployment.paused !== true &&
        deployment.endpointId !== null &&
        deployment.sharedDecimals !== null &&
        !!AppConf.prices.lifi.chains[deployment.chainName],
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

  private toSharedAmount(
    localAmount: bigint,
    localDecimals: number,
    sharedDecimals: number,
  ): bigint {
    return localDecimals >= sharedDecimals
      ? localAmount / 10n ** BigInt(localDecimals - sharedDecimals)
      : localAmount * 10n ** BigInt(sharedDecimals - localDecimals);
  }

  private toUsdMicros(value: bigint, decimals: number): bigint {
    return decimals >= 6
      ? value / 10n ** BigInt(decimals - 6)
      : value * 10n ** BigInt(6 - decimals);
  }

  private basisPoints(profit: bigint, cost: bigint): number {
    return cost === 0n ? 0 : Number((profit * 10_000n) / cost);
  }

  private formatUsd(value: bigint): string {
    return this.formatDecimal(value, 6, 6);
  }

  private formatSignedUsd(value: bigint): string {
    return value < 0n ? `-${this.formatUsd(-value)}` : this.formatUsd(value);
  }

  private formatDecimal(
    value: bigint,
    decimals: number,
    visibleDecimals: number,
  ): string {
    const base = 10n ** BigInt(decimals);
    const whole = value / base;
    const fraction = (value % base)
      .toString()
      .padStart(decimals, '0')
      .slice(0, visibleDecimals)
      .replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
  }
}
