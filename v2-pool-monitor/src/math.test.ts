import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { amountOut, conservativeBpsFee, evaluateDirection } from './math.js';
import type { MarketConfig, PoolConfig, PoolState } from './types.js';

const hash = `0x${'1'.repeat(64)}` as const;

describe('V2 pricing', () => {
  it('matches the constant-product amount-out formula', () => {
    assert.equal(amountOut(1_000n, 100_000n, 200_000n, 30), 1_974n);
  });

  it('rounds flash-loan fees upward for conservative screening', () => {
    assert.equal(conservativeBpsFee(101n, 5), 1n);
    assert.equal(conservativeBpsFee(10_000n, 5), 5n);
  });

  it('finds a profitable two-pool direction after costs', () => {
    const market: MarketConfig = {
      id: 'usdc-weth',
      baseToken: 'USDC',
      quoteToken: 'WETH',
      poolIds: ['cheap', 'expensive'],
      amounts: ['1000'],
    };
    const cheap: PoolConfig = {
      id: 'cheap',
      dex: 'A',
      address: '0x0000000000000000000000000000000000000001',
      token0: 'USDC',
      token1: 'WETH',
      feeBps: 30,
    };
    const expensive: PoolConfig = {
      ...cheap,
      id: 'expensive',
      dex: 'B',
      address: '0x0000000000000000000000000000000000000002',
    };
    const state = (poolId: string, reserve0: bigint, reserve1: bigint): PoolState => ({
      poolId,
      reserve0,
      reserve1,
      blockNumber: 1n,
      blockHash: hash,
    });
    const result = evaluateDirection({
      market,
      buyPool: cheap,
      sellPool: expensive,
      buyState: state('cheap', 10_000_000n, 5_000_000n),
      sellState: state('expensive', 12_000_000n, 5_000_000n),
      amountIn: 10_000n,
      flashLoanPremiumBps: 5,
      fixedCost: 5n,
      blockNumber: 1n,
      blockHash: hash,
    });

    assert.ok(result.finalOut > result.amountIn);
    assert.equal(result.netProfit, result.grossProfit - result.flashLoanFee - result.fixedCost);
  });
});
