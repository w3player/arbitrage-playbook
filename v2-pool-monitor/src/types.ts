import type { Address, Hash } from 'viem';

export interface TokenConfig {
  symbol: string;
  address: Address;
  decimals: number;
}

export interface PoolConfig {
  id: string;
  dex: string;
  address: Address;
  token0: string;
  token1: string;
  feeBps: number;
}

export interface MarketConfig {
  id: string;
  baseToken: string;
  quoteToken: string;
  poolIds: string[];
  amounts: string[];
}

export interface MonitorConfig {
  chain: {
    id: number;
    name: string;
    httpRpcEnv: string;
    wsRpcEnv: string;
  };
  statePath: string;
  flashLoanPremiumBps: number;
  fixedCostBase: string;
  minNetProfitBase: string;
  logAllEvaluations: boolean;
  tokens: TokenConfig[];
  pools: PoolConfig[];
  markets: MarketConfig[];
}

export interface PoolState {
  poolId: string;
  reserve0: bigint;
  reserve1: bigint;
  blockNumber: bigint;
  blockHash: Hash;
}

export interface PersistedState {
  schemaVersion: 1;
  chainId: number;
  poolFingerprint: string;
  cursor: {
    blockNumber: string;
    blockHash: Hash;
  };
  pools: Array<{
    poolId: string;
    reserve0: string;
    reserve1: string;
    blockNumber: string;
    blockHash: Hash;
  }>;
}

export interface Evaluation {
  marketId: string;
  blockNumber: bigint;
  blockHash: Hash;
  buyPoolId: string;
  sellPoolId: string;
  amountIn: bigint;
  intermediateOut: bigint;
  finalOut: bigint;
  grossProfit: bigint;
  flashLoanFee: bigint;
  fixedCost: bigint;
  netProfit: bigint;
}
