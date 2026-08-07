export type QuoteStream = 'same-chain' | 'rebalance';
export type QuoteKind = 'buy-exact-output' | 'sell-exact-input' | 'bridge-exact-input';
export type AmountMode = 'exact-input' | 'exact-output';
export type AssetSymbol = 'WETH' | 'USDC';

export interface QuoteTask {
  stream: QuoteStream;
  kind: QuoteKind;
  amountMode: AmountMode;
  assetSymbol: AssetSymbol;
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  amountDecimals: number;
}

export interface QuoteRequestRecord extends QuoteTask {
  fromAddress: string;
  slippage: number;
  skipSimulation: boolean;
}

export interface QuoteErrorRecord {
  name: string;
  message: string;
  httpStatus?: number;
  lifiCode?: string;
  responseBody?: unknown;
}

export interface RawQuoteRecord {
  schemaVersion: 1;
  id: string;
  requestedAt: string;
  receivedAt: string;
  durationMs: number;
  request: QuoteRequestRecord;
  response?: unknown;
  error?: QuoteErrorRecord;
}

export interface NormalizedQuote {
  id: string;
  stream: QuoteStream;
  kind: QuoteKind;
  assetSymbol: AssetSymbol;
  requestedAtMs: number;
  receivedAtMs: number;
  durationMs: number;
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  requestedAmount: bigint;
  amountDecimals: number;
  fromAmount: bigint;
  toAmount: bigint;
  toAmountMin: bigint;
  gasUsdMicros: bigint;
  nonIncludedFeeUsdMicros: bigint;
  includedFeeUsdMicros: bigint;
  executionDurationMs: number;
  tool: string;
  transactionRequest?: unknown;
}

export interface OpportunityFrame {
  id: string;
  timestampMs: number;
  buyChainId: number;
  sellChainId: number;
  targetWeth: bigint;
  buy: NormalizedQuote;
  sell: NormalizedQuote;
  buyCostUsdc: bigint;
  sellMinUsdc: bigint;
  explicitCostUsdMicros: bigint;
  expectedNetUsdMicros: bigint;
  expectedProfitBps: number;
  markWethPriceUsdMicros: bigint;
}

export interface InventoryBalance {
  wethAvailable: bigint;
  usdcAvailable: bigint;
  wethReserved: bigint;
  usdcReserved: bigint;
  wethPending: bigint;
  usdcPending: bigint;
  wethStranded: bigint;
  usdcStranded: bigint;
}

export type TradeOutcome =
  | 'both-succeeded'
  | 'both-failed'
  | 'buy-succeeded-sell-failed-recovered'
  | 'buy-succeeded-sell-failed-unresolved'
  | 'buy-failed-sell-succeeded-recovered'
  | 'buy-failed-sell-succeeded-unresolved';

export interface TradeRecord {
  id: string;
  decisionAtMs: number;
  settledAtMs: number;
  buyChainId: number;
  sellChainId: number;
  targetWeth: bigint;
  expectedNetUsdMicros: bigint;
  realizedCashPnlUsdMicros?: bigint;
  costUsdMicros: bigint;
  outcome: TradeOutcome;
  recoveryAtMs?: number;
}

export type RebalanceOutcome = 'completed' | 'refunded' | 'partial' | 'failed';

export interface RebalanceRecord {
  id: string;
  startedAtMs: number;
  completedAtMs: number;
  fromChainId: number;
  toChainId: number;
  assetSymbol: AssetSymbol;
  fromAmount: bigint;
  toAmountMin: bigint;
  costUsdMicros: bigint;
  outcome: RebalanceOutcome;
}

export interface EquityPoint {
  timestampMs: number;
  strategyValueUsdMicros: bigint;
  holdValueUsdMicros: bigint;
  excessValueUsdMicros: bigint;
  externalCostUsdMicros: bigint;
}

export interface BacktestResult {
  startedAtMs: number;
  endedAtMs: number;
  initialCapitalUsdMicros: bigint;
  finalStrategyValueUsdMicros: bigint;
  finalHoldValueUsdMicros: bigint;
  excessValueUsdMicros: bigint;
  externalCostUsdMicros: bigint;
  maxDrawdownUsdMicros: bigint;
  maxDrawdownBps: number;
  opportunitiesSeen: number;
  opportunitiesRejected: Record<string, number>;
  trades: TradeRecord[];
  rebalances: RebalanceRecord[];
  equity: EquityPoint[];
  finalInventory: Record<number, InventoryBalance>;
}
