import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import type { TimingStrategyString } from '@lifi/types';
import { parseUnits, parseUsd } from './utils/index.js';

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 20-byte hex address');
const positiveInt = z.number().int().positive();
const bps = z.number().int().min(0).max(10_000);
const timingStrategy = z.custom<TimingStrategyString>(
  (value) => typeof value === 'string' && /^minWaitTime-\d+-\d+-\d+$/.test(value),
  'must use minWaitTime-<milliseconds>-<results>-<milliseconds>',
);
const decimal = (decimals: number) =>
  z.string().refine((value) => {
    try {
      return parseUnits(value, decimals) >= 0n;
    } catch {
      return false;
    }
  }, `must be a non-negative number with at most ${decimals} decimals`);

export const configSchema = z
  .object({
    schemaVersion: z.literal(1),
    sqlitePath: z.string().min(1),
    lifi: z.object({
      baseUrl: z.string().url(),
      integrator: z.string().min(1).default('arbitrage-playbook'),
      fromAddress: address,
      apiKeyEnv: z.string().min(1),
      requestTimeoutMs: positiveInt,
      maxConcurrency: positiveInt,
      slippage: z.number().gt(0).lt(1),
      skipSimulation: z.boolean(),
      sameChainIntervalMs: positiveInt,
      rebalanceIntervalMs: positiveInt,
      sameChainTimingStrategy: timingStrategy.optional(),
      routeTimingStrategy: timingStrategy.optional(),
    }),
    chains: z
      .array(
        z.object({
          chainId: positiveInt,
          name: z.string().min(1),
          wethAddress: address,
          usdcAddress: address,
          wethDecimals: positiveInt,
          usdcDecimals: positiveInt,
          weightBps: bps,
        }),
      )
      .min(2),
    tradeSizesWeth: z.array(decimal(18)).min(1),
    rebalanceSizes: z.object({ WETH: z.array(decimal(18)), USDC: z.array(decimal(6)) }),
    backtest: z.object({
      initialCapitalUsd: decimal(6).refine((value) => parseUsd(value) > 0n),
      initialWethPriceUsd: decimal(6).refine((value) => parseUsd(value) > 0n),
      initialWethWeightBps: bps,
      minProfitUsd: decimal(6),
      minProfitBps: bps,
      maxTradeInventoryBps: bps,
      maxQuoteAgeMs: positiveInt,
      maxQuoteSkewMs: positiveInt,
      executionDelayMs: positiveInt,
      futureQuoteToleranceMs: positiveInt,
      cooldownMs: positiveInt,
      maxConcurrentTrades: positiveInt,
      emergencyMaxDelayMs: positiveInt,
      missingFutureQuoteIsFailure: z.boolean(),
      randomSeed: z.number().int(),
      failure: z.object({ correlatedFailureBps: bps, buyFailureBps: bps, sellFailureBps: bps }),
      rebalance: z.object({
        enabled: z.boolean(),
        hardLimitBps: bps,
        quoteMaxAgeMs: positiveInt,
        cooldownMs: positiveInt,
        completedBps: bps,
        refundedBps: bps,
        partialBps: bps,
        failedBps: bps,
        failedRecoveryBps: bps,
        defaultDurationMs: positiveInt,
      }),
    }),
  })
  .superRefine((config, context) => {
    if (config.chains.reduce((sum, chain) => sum + chain.weightBps, 0) !== 10_000) {
      context.addIssue({ code: 'custom', path: ['chains'], message: 'weightBps must total 10000' });
    }
    const probabilities = config.backtest.rebalance;
    if (
      probabilities.completedBps + probabilities.refundedBps + probabilities.partialBps + probabilities.failedBps !==
      10_000
    ) {
      context.addIssue({ code: 'custom', path: ['backtest', 'rebalance'], message: 'probabilities must total 10000' });
    }
  });

export type AppConfig = z.infer<typeof configSchema>;

export async function loadConfig(path: string): Promise<AppConfig> {
  const absolutePath = resolve(path);
  const config = configSchema.parse(JSON.parse(await readFile(absolutePath, 'utf8')));
  const base = dirname(absolutePath);
  config.sqlitePath = isAbsolute(config.sqlitePath) ? config.sqlitePath : resolve(base, config.sqlitePath);
  return config;
}
