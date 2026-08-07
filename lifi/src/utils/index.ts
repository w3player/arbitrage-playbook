const TEN = 10n

export function pow10(decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 80) {
    throw new RangeError(`Invalid decimal count: ${decimals}`)
  }
  return TEN ** BigInt(decimals)
}

export function parseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim()
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(trimmed)
  if (!match) throw new TypeError(`Invalid decimal value: ${value}`)

  const sign = match[1] === '-' ? -1n : 1n
  const integer = match[2] ?? '0'
  const fraction = match[3] ?? ''
  const exponent = Number(match[4] ?? '0')
  if (!Number.isSafeInteger(exponent)) throw new RangeError(`Invalid exponent: ${value}`)

  const digits = `${integer}${fraction}`.replace(/^0+(?=\d)/, '') || '0'
  const scale = decimals + exponent - fraction.length
  if (scale >= 0) return sign * BigInt(digits) * pow10(scale)

  const divisor = pow10(-scale)
  const raw = BigInt(digits)
  if (raw % divisor !== 0n) {
    throw new RangeError(`Value has more than ${decimals} decimal places: ${value}`)
  }
  return sign * (raw / divisor)
}

export function formatUnits(value: bigint, decimals: number, maxFraction = decimals): string {
  const negative = value < 0n
  const absolute = negative ? -value : value
  const base = pow10(decimals)
  const integer = absolute / base
  const fractionRaw = (absolute % base).toString().padStart(decimals, '0')
  const fraction = fractionRaw.slice(0, Math.max(0, maxFraction)).replace(/0+$/, '')
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`
}

export function mulDiv(value: bigint, multiplier: bigint, divisor: bigint): bigint {
  if (divisor === 0n) throw new RangeError('Division by zero')
  return (value * multiplier) / divisor
}

export function tokenAmountToUsdMicros(amount: bigint, tokenDecimals: number): bigint {
  return mulDiv(amount, 1_000_000n, pow10(tokenDecimals))
}

export function usdMicrosToTokenAmount(usdMicros: bigint, tokenDecimals: number): bigint {
  return mulDiv(usdMicros, pow10(tokenDecimals), 1_000_000n)
}

export function parseUsd(value: string): bigint {
  return parseUnits(value, 6)
}

/** Parse a positive USD cost and round fractions of one micro-dollar upward. */
export function parseUsdCost(value: string): bigint {
  const trimmed = value.trim()
  const plain = /^(\d+)(?:\.(\d*))?$/.exec(trimmed)
  if (plain) {
    const integer = BigInt(plain[1] ?? '0')
    const fraction = plain[2] ?? ''
    const micros = BigInt((fraction.slice(0, 6) || '0').padEnd(6, '0'))
    const remainder = fraction.slice(6)
    return integer * 1_000_000n + micros + (/[^0]/.test(remainder) ? 1n : 0n)
  }
  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric) || numeric < 0 || numeric * 1_000_000 > Number.MAX_SAFE_INTEGER) {
    throw new TypeError(`Invalid USD cost: ${value}`)
  }
  return BigInt(Math.ceil(numeric * 1_000_000))
}

export function formatUsd(value: bigint): string {
  return formatUnits(value, 6, 2)
}

export function clampBps(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new RangeError(`${label} must be an integer between 0 and 10000`)
  }
  return value
}
