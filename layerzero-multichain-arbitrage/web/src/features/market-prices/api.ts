import type { SpotPricesResponse } from './types';

export async function getSpotPrices(): Promise<SpotPricesResponse> {
  const response = await fetch('/api/spot-prices', {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`现价扫描失败：HTTP ${response.status}`);
  }
  return (await response.json()) as SpotPricesResponse;
}
