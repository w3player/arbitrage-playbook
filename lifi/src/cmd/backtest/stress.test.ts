import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeQuotes } from '../../biz/normalize-quote.js';
import { sameChainRawQuote, testConfig } from '../../testing/fixtures.js';
import { runStressTests } from './stress.js';

test('runs the complete stress matrix deterministically', () => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  const quotes = normalizeQuotes([
    sameChainRawQuote({
      id: 'buy-now',
      atMs: start,
      kind: 'buy-exact-output',
      chainId: 1,
      fromAmount: '3000000000',
      toAmount: '1000000000000000000',
    }),
    sameChainRawQuote({
      id: 'sell-now',
      atMs: start + 1_000,
      kind: 'sell-exact-input',
      chainId: 2,
      fromAmount: '1000000000000000000',
      toAmount: '3020000000',
    }),
    sameChainRawQuote({
      id: 'buy-future',
      atMs: start + 10_000,
      kind: 'buy-exact-output',
      chainId: 1,
      fromAmount: '2999000000',
      toAmount: '1000000000000000000',
    }),
    sameChainRawQuote({
      id: 'sell-future',
      atMs: start + 11_000,
      kind: 'sell-exact-input',
      chainId: 2,
      fromAmount: '1000000000000000000',
      toAmount: '3021000000',
    }),
  ]);
  const first = runStressTests(testConfig(), quotes);
  const second = runStressTests(testConfig(), quotes);
  assert.equal(first.length, 15);
  assert.deepEqual(
    first.map((run) => [run.id, run.result.excessValueUsdMicros]),
    second.map((run) => [run.id, run.result.excessValueUsdMicros]),
  );
});
