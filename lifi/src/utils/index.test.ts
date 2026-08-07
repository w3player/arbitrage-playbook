import assert from 'node:assert/strict'
import test from 'node:test'
import { formatUnits, parseUnits, parseUsd, parseUsdCost } from './index.js'

test('parseUnits and formatUnits preserve exact decimal amounts', () => {
  assert.equal(parseUnits('1.25', 18), 1_250_000_000_000_000_000n)
  assert.equal(parseUnits('2.5e-1', 6), 250_000n)
  assert.equal(formatUnits(1_250_000n, 6), '1.25')
  assert.equal(parseUsd('12.345678'), 12_345_678n)
  assert.equal(parseUsdCost('0.0000004'), 1n)
})

test('parseUnits rejects silent rounding', () => {
  assert.throws(() => parseUnits('0.0000001', 6), /more than 6 decimal places/)
})
