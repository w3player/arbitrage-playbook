export interface DexScreenerToken {
  address: string;
  name: string;
  symbol: string;
}

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: DexScreenerToken;
  quoteToken: DexScreenerToken;
  priceNative?: string;
  priceUsd?: string | null;
  priceChange?: { h24?: number } | null;
  volume?: { h24?: number };
  liquidity?: { usd?: number } | null;
}

export interface DexScreenerClientOptions {
  apiUrl: string;
  requestTimeoutMs: number;
}

export class DexScreenerClient {
  constructor(private readonly options: DexScreenerClientOptions) {}

  async tokenPairs(
    chainId: string,
    tokenAddresses: string[],
  ): Promise<DexScreenerPair[]> {
    if (tokenAddresses.length === 0) return [];
    if (tokenAddresses.length > 30) {
      throw new Error('DexScreener accepts at most 30 token addresses');
    }

    const addresses = tokenAddresses
      .map((address) => address.toLowerCase())
      .join(',');
    const response = await fetch(
      `${this.options.apiUrl}/tokens/v1/${encodeURIComponent(chainId)}/${addresses}`,
      {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      },
    );

    if (!response.ok) {
      throw new Error(`DexScreener request failed: HTTP ${response.status}`);
    }

    const body: unknown = await response.json();
    if (!Array.isArray(body)) {
      throw new Error('DexScreener returned an invalid response');
    }
    return body as DexScreenerPair[];
  }
}
