import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeQuotes } from '../../biz/normalize-quote.js'
import { sameChainRawQuote, testConfig } from '../../testing/fixtures.js'
import { BacktestEngine } from './engine.js'
import { buildOpportunityFrames } from './frames.js'

test('pairs executable quotes and settles against future quotes', () => {
  const start = Date.parse('2026-01-01T00:00:00Z')
  const raw = [
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
      toAmountMin: '3020000000',
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
      toAmountMin: '3021000000',
    }),
  ]
  const config = testConfig()
  const quotes = normalizeQuotes(raw)
  const frames = buildOpportunityFrames(quotes, config)
  assert.ok(frames.length > 0)
  const first = frames[0]
  assert.ok(first)
  assert.equal(first.expectedNetUsdMicros, 18_000_000n)

  const result = new BacktestEngine(config, quotes).run([first])
  assert.equal(result.trades.length, 1)
  assert.equal(result.trades[0]?.outcome, 'both-succeeded')
  assert.ok(result.excessValueUsdMicros > 0n)
})
