import type { AppConfig } from '../../config.js';
import type { NormalizedQuote, OpportunityFrame } from '../../types/types.js';
import { mulDiv, pow10, tokenAmountToUsdMicros } from '../../utils/index.js';

function latestKey(quote: NormalizedQuote): string {
  return `${quote.kind}:${quote.fromChainId}:${quote.requestedAmount}`;
}

function buildFrame(buy: NormalizedQuote, sell: NormalizedQuote, config: AppConfig): OpportunityFrame | undefined {
  if (buy.requestedAmount !== sell.requestedAmount || buy.fromChainId === sell.fromChainId) return undefined;
  if (Math.abs(buy.receivedAtMs - sell.receivedAtMs) > config.backtest.maxQuoteSkewMs) return undefined;
  const timestampMs = Math.max(buy.receivedAtMs, sell.receivedAtMs);
  if (timestampMs - buy.receivedAtMs > config.backtest.maxQuoteAgeMs) return undefined;
  if (timestampMs - sell.receivedAtMs > config.backtest.maxQuoteAgeMs) return undefined;

  const buyChain = config.chains.find((chain) => chain.chainId === buy.fromChainId);
  const sellChain = config.chains.find((chain) => chain.chainId === sell.fromChainId);
  if (!buyChain || !sellChain) return undefined;

  const buyUsd = tokenAmountToUsdMicros(buy.fromAmount, buyChain.usdcDecimals);
  const sellUsd = tokenAmountToUsdMicros(sell.toAmountMin, sellChain.usdcDecimals);
  const explicitCostUsdMicros =
    buy.gasUsdMicros + buy.nonIncludedFeeUsdMicros + sell.gasUsdMicros + sell.nonIncludedFeeUsdMicros;
  const expectedNetUsdMicros = sellUsd - buyUsd - explicitCostUsdMicros;
  const expectedProfitBps = buyUsd > 0n ? Number(mulDiv(expectedNetUsdMicros, 10_000n, buyUsd)) : -10_000;
  const target = buy.requestedAmount;
  const buyPrice = target > 0n ? mulDiv(buyUsd, pow10(18), target) : 0n;
  const sellPrice = target > 0n ? mulDiv(sellUsd, pow10(18), target) : 0n;

  return {
    id: `${buy.id}:${sell.id}`,
    timestampMs,
    buyChainId: buy.fromChainId,
    sellChainId: sell.fromChainId,
    targetWeth: target,
    buy,
    sell,
    buyCostUsdc: buy.fromAmount,
    sellMinUsdc: sell.toAmountMin,
    explicitCostUsdMicros,
    expectedNetUsdMicros,
    expectedProfitBps,
    markWethPriceUsdMicros: (buyPrice + sellPrice) / 2n,
  };
}

export function buildOpportunityFrames(quotes: NormalizedQuote[], config: AppConfig): OpportunityFrame[] {
  const sameChain = quotes
    .filter((quote) => quote.kind !== 'bridge-exact-input')
    .sort((left, right) => left.receivedAtMs - right.receivedAtMs);
  const latest = new Map<string, NormalizedQuote>();
  const emitted = new Set<string>();
  const frames: OpportunityFrame[] = [];

  for (const quote of sameChain) {
    latest.set(latestKey(quote), quote);
    const oppositeKind = quote.kind === 'buy-exact-output' ? 'sell-exact-input' : 'buy-exact-output';
    for (const chain of config.chains) {
      if (chain.chainId === quote.fromChainId) continue;
      const opposite = latest.get(`${oppositeKind}:${chain.chainId}:${quote.requestedAmount}`);
      if (!opposite) continue;
      const buy = quote.kind === 'buy-exact-output' ? quote : opposite;
      const sell = quote.kind === 'sell-exact-input' ? quote : opposite;
      const frame = buildFrame(buy, sell, config);
      if (frame && !emitted.has(frame.id)) {
        emitted.add(frame.id);
        frames.push(frame);
      }
    }
  }
  return frames.sort((left, right) => left.timestampMs - right.timestampMs);
}
