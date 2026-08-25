import type { RpcSnapshotResponse, SpotPricesResponse } from './types';

export async function getSpotPrices(): Promise<SpotPricesResponse> {
  const response = await fetch('/api/layerzero/spot-prices', {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`现价扫描失败：HTTP ${response.status}`);
  }
  return (await response.json()) as SpotPricesResponse;
}

export async function createRpcSnapshot(input: {
  assetId: number;
  buyChainName: string;
  sellChainName: string;
}): Promise<RpcSnapshotResponse> {
  const response = await fetch('/api/layerzero/rpc-snapshots', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message) ? body.message.join('；') : body?.message;
    throw new Error(message ?? `RPC 快照测算失败：HTTP ${response.status}`);
  }
  return (await response.json()) as RpcSnapshotResponse;
}
