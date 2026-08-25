import type { Hash } from 'viem';

import type { Evaluation, MarketConfig, PoolConfig, PoolState } from './types.js';

const BPS = 10_000n;

export function amountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: number): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const feeMultiplier = BPS - BigInt(feeBps);
  const amountInWithFee = amountIn * feeMultiplier;
  return (amountInWithFee * reserveOut) / (reserveIn * BPS + amountInWithFee);
}

export function conservativeBpsFee(amount: bigint, feeBps: number): bigint {
  if (amount === 0n || feeBps === 0) return 0n;
  return (amount * BigInt(feeBps) + BPS - 1n) / BPS;
}

function reservesForInput(pool: PoolConfig, state: PoolState, inputToken: string): [bigint, bigint] {
  if (pool.token0 === inputToken) return [state.reserve0, state.reserve1];
  if (pool.token1 === inputToken) return [state.reserve1, state.reserve0];
  throw new Error(`token ${inputToken} is not in pool ${pool.id}`);
}

export function evaluateDirection(input: {
  market: MarketConfig;
  buyPool: PoolConfig;
  sellPool: PoolConfig;
  buyState: PoolState;
  sellState: PoolState;
  amountIn: bigint;
  flashLoanPremiumBps: number;
  fixedCost: bigint;
  blockNumber: bigint;
  blockHash: Hash;
}): Evaluation {
  const buyReserves = reservesForInput(input.buyPool, input.buyState, input.market.baseToken);
  const intermediateOut = amountOut(input.amountIn, buyReserves[0], buyReserves[1], input.buyPool.feeBps);
  const sellReserves = reservesForInput(input.sellPool, input.sellState, input.market.quoteToken);
  const finalOut = amountOut(intermediateOut, sellReserves[0], sellReserves[1], input.sellPool.feeBps);
  const grossProfit = finalOut - input.amountIn;
  const flashLoanFee = conservativeBpsFee(input.amountIn, input.flashLoanPremiumBps);
  return {
    marketId: input.market.id,
    blockNumber: input.blockNumber,
    blockHash: input.blockHash,
    buyPoolId: input.buyPool.id,
    sellPoolId: input.sellPool.id,
    amountIn: input.amountIn,
    intermediateOut,
    finalOut,
    grossProfit,
    flashLoanFee,
    fixedCost: input.fixedCost,
    netProfit: grossProfit - flashLoanFee - input.fixedCost,
  };
}
