export type SpotMarketStatus = 'priced' | 'no_pool' | 'failed';

export interface SpotMarketDto {
  deploymentId: number;
  chainName: string;
  chainId: number;
  tokenAddress: string;
  status: SpotMarketStatus;
  priceUsd: string | null;
  liquidityUsd: string | null;
  volume24hUsd: string | null;
  priceChange24hPct: number | null;
  dexId: string | null;
  pairAddress: string | null;
  quoteSymbol: string | null;
  pairUrl: string | null;
  comparable: boolean;
  error: string | null;
}

export interface SpotAssetPriceDto {
  assetId: number;
  name: string;
  symbol: string;
  markets: SpotMarketDto[];
  pricedChains: number;
  comparableChains: number;
  lowChainName: string | null;
  highChainName: string | null;
  lowPriceUsd: string | null;
  highPriceUsd: string | null;
  spreadPct: number | null;
}

export interface SpotPricesResponseDto {
  source: 'dexscreener';
  observedAt: string;
  chains: Array<{
    chainName: string;
    chainId: number;
  }>;
  summary: {
    assets: number;
    deployments: number;
    pricedDeployments: number;
    missingDeployments: number;
    comparableAssets: number;
    maxSpreadPct: number | null;
  };
  assets: SpotAssetPriceDto[];
}
