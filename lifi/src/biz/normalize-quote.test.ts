import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeQuote } from './normalize-quote.js';
import { sameChainRawQuote } from '../testing/fixtures.js';

test('normalizes exact-output quote and separates explicit costs', () => {
  const raw = sameChainRawQuote({
    id: 'buy-1',
    atMs: Date.parse('2026-01-01T00:00:00Z'),
    kind: 'buy-exact-output',
    chainId: 1,
    fromAmount: '3000000000',
    toAmount: '1000000000000000000',
    gasUsd: '1.25',
  });
  const response = raw.response as { estimate: { feeCosts?: unknown[] } };
  response.estimate.feeCosts = [
    { amountUSD: '0.50', included: false },
    { amountUSD: '0.25', included: true },
  ];
  const quote = normalizeQuote(raw);
  assert.ok(quote);
  assert.equal(quote.fromAmount, 3_000_000_000n);
  assert.equal(quote.gasUsdMicros, 1_250_000n);
  assert.equal(quote.nonIncludedFeeUsdMicros, 500_000n);
  assert.equal(quote.includedFeeUsdMicros, 250_000n);
});
