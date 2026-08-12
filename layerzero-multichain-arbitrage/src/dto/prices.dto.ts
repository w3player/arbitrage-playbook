export interface PriceScanSummaryDto {
  assets: number;
  completedAssets: number;
  deployments: number;
  succeededQuotes: number;
  failedQuotes: number;
  crosschainSpreads: number;
}

export interface PriceScanStatusDto {
  state: 'idle' | 'running' | 'failed';
  runId: string | null;
  currentAsset: string | null;
  startedAt: string | null;
  completedAt: string | null;
  summary: PriceScanSummaryDto | null;
  error: string | null;
}

export interface PriceScanTriggerDto {
  status: 'started' | 'already_running';
  runId: string | null;
}

export interface PriceLegDto {
  deploymentId: number;
  chainName: string;
  chainId: number;
  tokenAddress: string;
  settlementSymbol: string;
  settlementAddress: string;
  amountUsd: string;
  unitPriceUsd: string;
  gasUsd: string;
  extraFeeUsd: string;
  tool: string;
  quotedAt: string;
  validUntil: string;
  durationMs: number;
}

export interface CrosschainSpreadDto {
  id: string;
  runId: string;
  assetId: number;
  name: string;
  symbol: string;
  tokenAmount: string;
  sharedDecimals: number;
  buy: PriceLegDto;
  sell: PriceLegDto;
  grossProfitUsd: string;
  grossSpreadBps: number;
  directCostUsd: string;
  directProfitUsd: string;
  directSpreadBps: number;
  quoteSkewMs: number;
  observedAt: string;
  status: 'positive' | 'negative' | 'stale';
}

export interface PriceFailureDto {
  assetId: number;
  symbol: string;
  deploymentId: number;
  chainName: string;
  side: 'probe' | 'buy' | 'sell';
  code: string;
  message: string;
  observedAt: string;
}

export interface PricesResponseDto {
  summary: {
    runId: string | null;
    pricedAssets: number;
    crosschainSpreads: number;
    positiveSpreads: number;
    failedQuotes: number;
    updatedAt: string | null;
  };
  spreads: CrosschainSpreadDto[];
  failures: PriceFailureDto[];
}
