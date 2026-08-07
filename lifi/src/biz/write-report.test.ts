import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import type { BacktestResult } from '../types/types.js';
import { testConfig } from '../testing/fixtures.js';
import { writeBacktestReport } from './write-report.js';

test('writes human and machine-readable reports containing bigint values', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'lifi-report-'));
  const config = testConfig();
  const emptyInventory = {
    wethAvailable: 0n,
    usdcAvailable: 0n,
    wethReserved: 0n,
    usdcReserved: 0n,
    wethPending: 0n,
    usdcPending: 0n,
    wethStranded: 0n,
    usdcStranded: 0n,
  };
  const result: BacktestResult = {
    startedAtMs: 1_767_225_600_000,
    endedAtMs: 1_767_225_660_000,
    initialCapitalUsdMicros: 100_000_000_000n,
    finalStrategyValueUsdMicros: 100_010_000_000n,
    finalHoldValueUsdMicros: 100_000_000_000n,
    excessValueUsdMicros: 10_000_000n,
    externalCostUsdMicros: 2_000_000n,
    maxDrawdownUsdMicros: 1_000_000n,
    maxDrawdownBps: 1,
    opportunitiesSeen: 1,
    opportunitiesRejected: {},
    trades: [],
    rebalances: [],
    equity: [],
    finalInventory: { 1: { ...emptyInventory }, 2: { ...emptyInventory } },
  };
  await writeBacktestReport(result, config, directory);
  const markdown = await readFile(resolve(directory, 'summary.md'), 'utf8');
  const json = await readFile(resolve(directory, 'result.json'), 'utf8');
  assert.match(markdown, /相对原样持有多赚\/少赚/);
  assert.equal((JSON.parse(json) as { excessValueUsdMicros: string }).excessValueUsdMicros, '10000000');
});
