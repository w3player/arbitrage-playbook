import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { PersistedState, PoolState } from './types.js';

export async function loadState(path: string): Promise<PersistedState | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as PersistedState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function saveState(
  path: string,
  input: {
    chainId: number;
    poolFingerprint: string;
    cursor: { blockNumber: bigint; blockHash: `0x${string}` };
    pools: Iterable<PoolState>;
  },
): Promise<void> {
  const state: PersistedState = {
    schemaVersion: 1,
    chainId: input.chainId,
    poolFingerprint: input.poolFingerprint,
    cursor: {
      blockNumber: input.cursor.blockNumber.toString(),
      blockHash: input.cursor.blockHash,
    },
    pools: [...input.pools].map((pool) => ({
      poolId: pool.poolId,
      reserve0: pool.reserve0.toString(),
      reserve1: pool.reserve1.toString(),
      blockNumber: pool.blockNumber.toString(),
      blockHash: pool.blockHash,
    })),
  };
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}
