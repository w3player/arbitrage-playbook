export interface PriceScanSummary {
  assets: number;
  completedAssets: number;
  deployments: number;
  succeededQuotes: number;
  failedQuotes: number;
  crosschainSpreads: number;
}

export interface PriceScanStatus {
  state: 'idle' | 'running' | 'failed';
  runId: string | null;
  currentAsset: string | null;
  startedAt: string | null;
  completedAt: string | null;
  summary: PriceScanSummary | null;
  error: string | null;
}

export interface PriceScanTrigger {
  status: 'started' | 'already_running';
  runId: string | null;
}

export interface PriceLeg {
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

export interface CrosschainSpread {
  id: string;
  runId: string;
  assetId: number;
  name: string;
  symbol: string;
  tokenAmount: string;
  sharedDecimals: number;
  buy: PriceLeg;
  sell: PriceLeg;
  grossProfitUsd: string;
  grossSpreadBps: number;
  directCostUsd: string;
  directProfitUsd: string;
  directSpreadBps: number;
  quoteSkewMs: number;
  observedAt: string;
  status: 'positive' | 'negative' | 'stale';
}

export interface PriceFailure {
  assetId: number;
  symbol: string;
  deploymentId: number;
  chainName: string;
  side: 'probe' | 'buy' | 'sell';
  code: string;
  message: string;
  observedAt: string;
}

export interface PricesResponse {
  summary: {
    runId: string | null;
    pricedAssets: number;
    crosschainSpreads: number;
    positiveSpreads: number;
    failedQuotes: number;
    updatedAt: string | null;
  };
  spreads: CrosschainSpread[];
  failures: PriceFailure[];
}
