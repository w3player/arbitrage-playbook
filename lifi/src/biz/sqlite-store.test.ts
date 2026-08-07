import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { sameChainRawQuote } from '../testing/fixtures.js'
import { QuoteStore } from './sqlite-store.js'

test('stores raw quote records and filters them by time', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'lifi-store-'))
  const store = new QuoteStore(resolve(directory, 'quotes.sqlite'))
  const atMs = Date.parse('2026-01-01T00:00:00Z')
  const record = sameChainRawQuote({
    id: 'stored-buy',
    atMs,
    kind: 'buy-exact-output',
    chainId: 1,
    fromAmount: '3000000000',
    toAmount: '1000000000000000000',
  })
  try {
    store.insert(record)
    store.insert(record)
    assert.equal(store.count(), 1)
    assert.deepEqual(store.load({ fromMs: atMs - 1, toMs: atMs + 1 }), [record])
    assert.deepEqual(store.load({ fromMs: atMs + 1 }), [])
  } finally {
    store.close()
  }
})
