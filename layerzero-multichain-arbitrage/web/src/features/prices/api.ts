import type { PricesResponse, PriceScanStatus, PriceScanTrigger } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { accept: 'application/json' },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`API request failed: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export function getPrices(): Promise<PricesResponse> {
  return request<PricesResponse>('/prices');
}

export function getPriceScanStatus(): Promise<PriceScanStatus> {
  return request<PriceScanStatus>('/price-scans/status');
}

export function triggerPriceScan(): Promise<PriceScanTrigger> {
  return request<PriceScanTrigger>('/price-scans', { method: 'POST' });
}
