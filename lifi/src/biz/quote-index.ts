import type { AssetSymbol, NormalizedQuote, QuoteKind } from '../types/types.js';

function sameChainKey(kind: QuoteKind, chainId: number, amount: bigint): string {
  return `${kind}:${chainId}:${amount}`;
}

function bridgeKey(fromChainId: number, toChainId: number, asset: AssetSymbol): string {
  return `${fromChainId}:${toChainId}:${asset}`;
}

function firstAtOrAfter(quotes: NormalizedQuote[], timestampMs: number): number {
  let low = 0;
  let high = quotes.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const quote = quotes[middle];
    if (quote !== undefined && quote.receivedAtMs < timestampMs) low = middle + 1;
    else high = middle;
  }
  return low;
}

export class QuoteIndex {
  private readonly sameChain = new Map<string, NormalizedQuote[]>();
  private readonly bridges = new Map<string, NormalizedQuote[]>();

  constructor(readonly quotes: NormalizedQuote[]) {
    for (const quote of quotes) {
      if (quote.kind === 'bridge-exact-input') {
        const key = bridgeKey(quote.fromChainId, quote.toChainId, quote.assetSymbol);
        const list = this.bridges.get(key) ?? [];
        list.push(quote);
        this.bridges.set(key, list);
      } else {
        const key = sameChainKey(quote.kind, quote.fromChainId, quote.requestedAmount);
        const list = this.sameChain.get(key) ?? [];
        list.push(quote);
        this.sameChain.set(key, list);
      }
    }
    for (const list of [...this.sameChain.values(), ...this.bridges.values()]) {
      list.sort((left, right) => left.receivedAtMs - right.receivedAtMs);
    }
  }

  findFirstSameChain(
    kind: 'buy-exact-output' | 'sell-exact-input',
    chainId: number,
    amount: bigint,
    fromMs: number,
    toMs: number,
  ): NormalizedQuote | undefined {
    const list = this.sameChain.get(sameChainKey(kind, chainId, amount)) ?? [];
    const start = firstAtOrAfter(list, fromMs);
    const quote = list[start];
    return quote !== undefined && quote.receivedAtMs <= toMs ? quote : undefined;
  }

  findBridge(
    fromChainId: number,
    toChainId: number,
    asset: AssetSymbol,
    maximumAmount: bigint,
    timestampMs: number,
    maxAgeMs: number,
  ): NormalizedQuote | undefined {
    const list = this.bridges.get(bridgeKey(fromChainId, toChainId, asset)) ?? [];
    let selected: NormalizedQuote | undefined;
    for (let index = firstAtOrAfter(list, timestampMs - maxAgeMs); index < list.length; index += 1) {
      const quote = list[index];
      if (quote === undefined || quote.receivedAtMs > timestampMs) break;
      if (quote.fromAmount > maximumAmount) continue;
      if (
        selected === undefined ||
        quote.fromAmount > selected.fromAmount ||
        (quote.fromAmount === selected.fromAmount && quote.receivedAtMs > selected.receivedAtMs)
      ) {
        selected = quote;
      }
    }
    return selected;
  }
}
