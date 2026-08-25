import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AssetStatus, DeploymentScanStatus } from '../config/enums';
import { AppConf } from '../constants';
import { AssetEntity } from '../database/entities/asset.entity';
import { DeploymentEntity } from '../database/entities/deployment.entity';
import type {
  RpcSnapshotRequestDto,
  RpcSnapshotResponseDto,
  RpcSnapshotSwapLegDto,
} from '../dto/rpc-snapshot.dto';
import {
  LifiQuoteClient,
  OftContractClient,
  parseDecimal,
  quoteCostUsdMicros,
} from '../lib';
import type { LifiQuoteResult, OftChainConfig, OftTransferQuote } from '../lib';

interface SettlementChainConfig {
  chainId: number;
  settlementSymbol: string;
  settlementAddress: string;
  settlementDecimals: number;
}

@Injectable()
export class RpcSnapshotService {
  private readonly lifiChains: Record<string, SettlementChainConfig> =
    AppConf.prices.lifi.chains;
  private readonly rpcChains: Record<string, OftChainConfig> =
    AppConf.layerZero.chains;
  private readonly quoteClient: LifiQuoteClient;

  constructor(
    @InjectRepository(AssetEntity)
    private readonly assetRepository: Repository<AssetEntity>,
    configService: ConfigService,
  ) {
    this.quoteClient = new LifiQuoteClient({
      apiKey: configService.get<string>('LIFI_API_KEY'),
      integrator: AppConf.prices.lifi.integrator,
      fromAddress: AppConf.prices.lifi.fromAddress,
      requestTimeoutMs: AppConf.prices.lifi.requestTimeoutMs,
      slippage: AppConf.prices.lifi.slippage,
    });
  }

  async create(
    request: RpcSnapshotRequestDto,
  ): Promise<RpcSnapshotResponseDto> {
    const asset = await this.assetRepository.findOne({
      where: { id: request.assetId, status: AssetStatus.VERIFIED },
      relations: { deployments: true },
    });
    if (!asset) {
      throw new NotFoundException('verified asset not found');
    }

    const buyDeployment = this.deployment(asset, request.buyChainName);
    const sellDeployment = this.deployment(asset, request.sellChainName);
    this.assertActivePath(buyDeployment, sellDeployment);
    const sharedDecimals = buyDeployment.sharedDecimals!;
    if (sellDeployment.sharedDecimals !== sharedDecimals) {
      throw new BadRequestException('shared decimals mismatch');
    }

    const buyChain = this.settlementChain(request.buyChainName);
    const sellChain = this.settlementChain(request.sellChainName);
    const buyResult = await this.quoteClient.quote({
      chainId: buyDeployment.chainId!,
      fromToken: buyChain.settlementAddress,
      toToken: this.tradeTokenAddress(buyDeployment),
      amount: parseDecimal(
        AppConf.prices.targetSettlementAmount,
        buyChain.settlementDecimals,
      ).toString(),
      mode: 'exact-input',
    });
    const buyEstimate = this.requireQuote(buyResult, 'low-chain buy');
    const boughtAmount = BigInt(
      buyEstimate.toAmountMin ?? buyEstimate.toAmount,
    );
    if (boughtAmount <= 0n) {
      throw new BadRequestException('low-chain buy returned zero tokens');
    }

    const bridgeQuote = await new OftContractClient(
      this.rpcChain(request.buyChainName),
      [sellDeployment.endpointId!],
    ).quoteTransfer({
      oftAddress: buyDeployment.oftAddress,
      destinationEndpointId: sellDeployment.endpointId!,
      recipient: AppConf.prices.lifi.fromAddress,
      amountLD: boughtAmount,
    });
    if (
      bridgeQuote.amountSentLD < bridgeQuote.minAmountLD ||
      bridgeQuote.amountSentLD > bridgeQuote.maxAmountLD
    ) {
      throw new BadRequestException('OFT amount is outside transfer limits');
    }

    const receivedShared = this.toSharedAmount(
      bridgeQuote.amountReceivedLD,
      buyDeployment.localDecimals!,
      sharedDecimals,
    );
    const destinationAmount = this.fromSharedAmount(
      receivedShared,
      sharedDecimals,
      sellDeployment.localDecimals!,
    );
    if (destinationAmount <= 0n) {
      throw new BadRequestException(
        'OFT quote returned zero destination tokens',
      );
    }

    const sellResult = await this.quoteClient.quote({
      chainId: sellDeployment.chainId!,
      fromToken: this.tradeTokenAddress(sellDeployment),
      toToken: sellChain.settlementAddress,
      amount: destinationAmount.toString(),
      mode: 'exact-input',
    });
    const sellEstimate = this.requireQuote(sellResult, 'high-chain sell');

    const inputUsd = this.toUsdMicros(
      BigInt(buyEstimate.fromAmount),
      buyChain.settlementDecimals,
    );
    const outputUsd = this.toUsdMicros(
      BigInt(sellEstimate.toAmountMin ?? sellEstimate.toAmount),
      sellChain.settlementDecimals,
    );
    const buyGasUsd = quoteCostUsdMicros(buyEstimate.gasCosts);
    const buyExtraFeeUsd = quoteCostUsdMicros(buyEstimate.feeCosts, false);
    const sellGasUsd = quoteCostUsdMicros(sellEstimate.gasCosts);
    const sellExtraFeeUsd = quoteCostUsdMicros(sellEstimate.feeCosts, false);
    const nativePriceUsdMicros = this.nativePriceUsdMicros(buyResult);
    const bridgeNativeFeeUsd = this.nativeAmountUsdMicros(
      bridgeQuote.nativeFee,
      nativePriceUsdMicros.price,
      nativePriceUsdMicros.decimals,
    );
    const sourceGasUnits = BigInt(AppConf.prices.rpcSnapshotSourceGasUnits);
    const sourceGasUsd = this.nativeAmountUsdMicros(
      bridgeQuote.gasPrice * sourceGasUnits,
      nativePriceUsdMicros.price,
      nativePriceUsdMicros.decimals,
    );
    const explicitCost =
      buyGasUsd +
      buyExtraFeeUsd +
      bridgeNativeFeeUsd +
      sourceGasUsd +
      sellGasUsd +
      sellExtraFeeUsd;
    const grossProfit = outputUsd - inputUsd;
    const netProfit = grossProfit - explicitCost;
    const requestedShared = this.toSharedAmount(
      bridgeQuote.requestedAmountLD,
      buyDeployment.localDecimals!,
      sharedDecimals,
    );
    const sentShared = this.toSharedAmount(
      bridgeQuote.amountSentLD,
      buyDeployment.localDecimals!,
      sharedDecimals,
    );
    const tokenFeeShared = sentShared - receivedShared;
    const dust = bridgeQuote.requestedAmountLD - bridgeQuote.amountSentLD;

    return {
      mode: 'rpc_snapshot',
      observedAt: new Date().toISOString(),
      assetId: asset.id,
      name: asset.name,
      symbol: asset.symbol,
      buy: this.swapLeg(
        request.buyChainName,
        buyChain,
        buyDeployment,
        inputUsd,
        boughtAmount,
        buyGasUsd,
        buyExtraFeeUsd,
        buyResult,
      ),
      bridge: {
        sourceChainName: request.buyChainName,
        destinationChainName: request.sellChainName,
        destinationEndpointId: bridgeQuote.destinationEndpointId,
        requestedAmount: this.formatDecimal(
          bridgeQuote.requestedAmountLD,
          buyDeployment.localDecimals!,
          8,
        ),
        sentAmount: this.formatDecimal(
          bridgeQuote.amountSentLD,
          buyDeployment.localDecimals!,
          8,
        ),
        receivedAmount: this.formatDecimal(
          destinationAmount,
          sellDeployment.localDecimals!,
          8,
        ),
        dustAmount: this.formatDecimal(dust, buyDeployment.localDecimals!, 8),
        tokenFeeAmount: this.formatDecimal(tokenFeeShared, sharedDecimals, 8),
        tokenLossBps: this.basisPoints(
          requestedShared - receivedShared,
          requestedShared,
        ),
        nativeFeeRaw: bridgeQuote.nativeFee.toString(),
        nativeFeeUsd: this.formatUsd(bridgeNativeFeeUsd),
        lzTokenFeeRaw: bridgeQuote.lzTokenFee.toString(),
        sourceGasUnits: sourceGasUnits.toString(),
        sourceGasUsd: this.formatUsd(sourceGasUsd),
        sourceGasEstimated: true,
        sourceBlockNumber: bridgeQuote.blockNumber.toString(),
        feeDetails: bridgeQuote.feeDetails.map((fee) => ({
          amount: this.formatDecimal(
            fee.feeAmountLD,
            buyDeployment.localDecimals!,
            8,
          ),
          description: fee.description,
        })),
        quotedAt: bridgeQuote.quotedAt.toISOString(),
      },
      sell: this.swapLeg(
        request.sellChainName,
        sellChain,
        sellDeployment,
        outputUsd,
        destinationAmount,
        sellGasUsd,
        sellExtraFeeUsd,
        sellResult,
      ),
      summary: {
        inputUsd: this.formatUsd(inputUsd),
        outputUsd: this.formatUsd(outputUsd),
        grossProfitUsd: this.formatSignedUsd(grossProfit),
        explicitCostUsd: this.formatUsd(explicitCost),
        netProfitUsd: this.formatSignedUsd(netProfit),
        netProfitBps: this.basisPoints(netProfit, inputUsd),
        status: netProfit > 0n ? 'positive' : 'negative',
      },
      limitations: [
        'RPC 快照使用当前目标链卖价，不代表跨链到账时仍可成交。',
        `源链 OFT send Gas 使用 ${AppConf.prices.rpcSnapshotSourceGasUnits.toLocaleString('en-US')} gas units 估算，未执行带余额和授权的状态模拟。`,
        '未计入首次 ERC-20 授权、失败恢复、资金占用和价格延迟风险。',
      ],
    };
  }

  private deployment(asset: AssetEntity, chainName: string): DeploymentEntity {
    const deployment = asset.deployments.find(
      (item) =>
        item.chainName === chainName &&
        item.scanStatus === DeploymentScanStatus.VERIFIED &&
        item.paused !== true &&
        item.chainId !== null &&
        item.endpointId !== null &&
        item.localDecimals !== null &&
        item.sharedDecimals !== null,
    );
    if (!deployment) {
      throw new BadRequestException(
        `verified deployment not found on ${chainName}`,
      );
    }
    return deployment;
  }

  private assertActivePath(
    source: DeploymentEntity,
    destination: DeploymentEntity,
  ): void {
    const forward = Object.values(source.peers ?? {}).some(
      (peer) =>
        peer.endpointId === destination.endpointId && peer.status === 'active',
    );
    const reverse = Object.values(destination.peers ?? {}).some(
      (peer) =>
        peer.endpointId === source.endpointId && peer.status === 'active',
    );
    if (!forward || !reverse) {
      throw new BadRequestException('LayerZero path is not active both ways');
    }
  }

  private settlementChain(chainName: string): SettlementChainConfig {
    const chain = this.lifiChains[chainName];
    if (!chain) {
      throw new BadRequestException(
        `settlement token is not configured for ${chainName}`,
      );
    }
    return chain;
  }

  private rpcChain(chainName: string): OftChainConfig {
    const chain = this.rpcChains[chainName];
    if (!chain) {
      throw new BadRequestException(`RPC is not configured for ${chainName}`);
    }
    return chain;
  }

  private tradeTokenAddress(deployment: DeploymentEntity): string {
    return deployment.tokenAddress ?? deployment.oftAddress;
  }

  private requireQuote(
    result: LifiQuoteResult,
    label: string,
  ): NonNullable<LifiQuoteResult['response']>['estimate'] {
    if (!result.response?.estimate || result.error) {
      throw new BadRequestException(
        `${label} quote failed: ${result.error?.message ?? 'missing estimate'}`,
      );
    }
    return result.response.estimate;
  }

  private nativePriceUsdMicros(result: LifiQuoteResult): {
    price: bigint;
    decimals: number;
  } {
    const gasCost = result.response?.estimate.gasCosts?.find(
      (cost) => Number(cost.token.priceUSD) > 0,
    );
    if (!gasCost) {
      throw new BadRequestException(
        'native gas token USD price is unavailable',
      );
    }
    return {
      price: parseDecimal(gasCost.token.priceUSD, 6),
      decimals: gasCost.token.decimals,
    };
  }

  private nativeAmountUsdMicros(
    amount: bigint,
    nativePriceUsdMicros: bigint,
    nativeDecimals: number,
  ): bigint {
    return (amount * nativePriceUsdMicros) / 10n ** BigInt(nativeDecimals);
  }

  private swapLeg(
    chainName: string,
    chain: SettlementChainConfig,
    deployment: DeploymentEntity,
    settlementAmountUsd: bigint,
    tokenAmount: bigint,
    gasUsd: bigint,
    extraFeeUsd: bigint,
    result: LifiQuoteResult,
  ): RpcSnapshotSwapLegDto {
    return {
      chainName,
      settlementSymbol: chain.settlementSymbol,
      settlementAmountUsd: this.formatUsd(settlementAmountUsd),
      tokenAmount: this.formatDecimal(
        tokenAmount,
        deployment.localDecimals!,
        8,
      ),
      tokenAmountRaw: tokenAmount.toString(),
      gasUsd: this.formatUsd(gasUsd),
      extraFeeUsd: this.formatUsd(extraFeeUsd),
      tool: result.response?.tool ?? 'unknown',
      quotedAt: result.receivedAt.toISOString(),
    };
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

  private fromSharedAmount(
    sharedAmount: bigint,
    sharedDecimals: number,
    localDecimals: number,
  ): bigint {
    return localDecimals >= sharedDecimals
      ? sharedAmount * 10n ** BigInt(localDecimals - sharedDecimals)
      : sharedAmount / 10n ** BigInt(sharedDecimals - localDecimals);
  }

  private toUsdMicros(value: bigint, decimals: number): bigint {
    return decimals >= 6
      ? value / 10n ** BigInt(decimals - 6)
      : value * 10n ** BigInt(6 - decimals);
  }

  private basisPoints(value: bigint, base: bigint): number {
    return base === 0n ? 0 : Number((value * 10_000n) / base);
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
    if (value < 0n) {
      return `-${this.formatDecimal(-value, decimals, visibleDecimals)}`;
    }
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
