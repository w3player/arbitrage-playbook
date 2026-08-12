import type { AssetsResponse, ScanStatus, ScanTriggerResponse } from './types';

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

export function getAssets(): Promise<AssetsResponse> {
  return request<AssetsResponse>('/assets');
}

export function getScanStatus(): Promise<ScanStatus> {
  return request<ScanStatus>('/scan/status');
}

export function triggerScan(): Promise<ScanTriggerResponse> {
  return request<ScanTriggerResponse>('/scan', { method: 'POST' });
}
