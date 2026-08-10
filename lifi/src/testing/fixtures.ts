import type { AppConfig } from '../config.js';
import type { QuoteKind, RawQuoteRecord } from '../types/types.js';
import { parseUnits } from '../utils/index.js';

export function testConfig(): AppConfig {
  return {
    schemaVersion: 1,
    sqlitePath: '/tmp/lifi-test-data/quotes.sqlite',
    lifi: {
      baseUrl: 'https://li.quest/v1',
      integrator: 'arbitrage-playbook-test',
      fromAddress: '0x000000000000000000000000000000000000dEaD',
      apiKeyEnv: 'LIFI_API_KEY',
      requestTimeoutMs: 10_000,
      maxConcurrency: 2,
      slippage: 0.003,
      skipSimulation: false,
      sameChainIntervalMs: 60_000,
      rebalanceIntervalMs: 600_000,
    },
    chains: [
      {
        chainId: 1,
        name: 'One',
        wethAddress: '0x0000000000000000000000000000000000000001',
        usdcAddress: '0x0000000000000000000000000000000000000002',
        wethDecimals: 18,
        usdcDecimals: 6,
        weightBps: 5000,
      },
      {
        chainId: 2,
        name: 'Two',
        wethAddress: '0x0000000000000000000000000000000000000003',
        usdcAddress: '0x0000000000000000000000000000000000000004',
        wethDecimals: 18,
        usdcDecimals: 6,
        weightBps: 5000,
      },
    ],
    tradeSizesWeth: ['1'],
    rebalanceSizes: { WETH: ['1'], USDC: ['1000'] },
    backtest: {
      initialCapitalUsd: '100000',
      initialWethPriceUsd: '3000',
      initialWethWeightBps: 5000,
      minProfitUsd: '1',
      minProfitBps: 1,
      maxTradeInventoryBps: 2000,
      maxQuoteAgeMs: 60_000,
      maxQuoteSkewMs: 30_000,
      executionDelayMs: 5_000,
      futureQuoteToleranceMs: 20_000,
      cooldownMs: 10_000,
      maxConcurrentTrades: 1,
      emergencyMaxDelayMs: 60_000,
      missingFutureQuoteIsFailure: true,
      randomSeed: 7,
      failure: { correlatedFailureBps: 0, buyFailureBps: 0, sellFailureBps: 0 },
      rebalance: {
        enabled: false,
        hardLimitBps: 3000,
        quoteMaxAgeMs: 600_000,
        cooldownMs: 600_000,
        completedBps: 10_000,
        refundedBps: 0,
        partialBps: 0,
        failedBps: 0,
        failedRecoveryBps: 5000,
        defaultDurationMs: 300_000,
      },
    },
  };
}

export function sameChainRawQuote(options: {
  id: string;
  atMs: number;
  kind: Exclude<QuoteKind, 'bridge-exact-input'>;
  chainId: number;
  requestedWeth?: string;
  fromAmount: string;
  toAmount: string;
  toAmountMin?: string;
  gasUsd?: string;
}): RawQuoteRecord {
  const config = testConfig();
  const chain = config.chains.find((candidate) => candidate.chainId === options.chainId);
  if (!chain) throw new Error('Unknown fixture chain');
  const buy = options.kind === 'buy-exact-output';
  return {
    schemaVersion: 1,
    id: options.id,
    requestedAt: new Date(options.atMs - 100).toISOString(),
    receivedAt: new Date(options.atMs).toISOString(),
    durationMs: 100,
    request: {
      stream: 'same-chain',
      kind: options.kind,
      amountMode: buy ? 'exact-output' : 'exact-input',
      assetSymbol: 'WETH',
      fromChainId: options.chainId,
      toChainId: options.chainId,
      fromTokenAddress: buy ? chain.usdcAddress : chain.wethAddress,
      toTokenAddress: buy ? chain.wethAddress : chain.usdcAddress,
      amount: parseUnits(options.requestedWeth ?? '1', 18).toString(),
      amountDecimals: 18,
      fromAddress: config.lifi.fromAddress,
      slippage: config.lifi.slippage,
      skipSimulation: false,
    },
    response: {
      tool: 'fixture-dex',
      estimate: {
        fromAmount: options.fromAmount,
        toAmount: options.toAmount,
        toAmountMin: options.toAmountMin ?? options.toAmount,
        executionDuration: 5,
        gasCosts: [{ amountUSD: options.gasUsd ?? '1' }],
        feeCosts: [],
      },
    },
  };
}
