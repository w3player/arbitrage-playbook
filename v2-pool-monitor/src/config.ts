import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { getAddress, isAddress } from 'viem';

import type { MarketConfig, MonitorConfig, PoolConfig, TokenConfig } from './types.js';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as UnknownRecord;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer`);
  }
  return value;
}

function bps(value: unknown, label: string): number {
  const parsed = integer(value, label);
  if (parsed < 0 || parsed >= 10_000) {
    throw new Error(`${label} must be between 0 and 9999`);
  }
  return parsed;
}

function address(value: unknown, label: string) {
  const parsed = string(value, label);
  if (!isAddress(parsed)) throw new Error(`${label} is not an EVM address`);
  return getAddress(parsed);
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  return value.map((item, index) => string(item, `${label}[${index}]`));
}

function parseToken(value: unknown, index: number): TokenConfig {
  const item = record(value, `tokens[${index}]`);
  const decimals = integer(item.decimals, `tokens[${index}].decimals`);
  if (decimals < 0 || decimals > 255) {
    throw new Error(`tokens[${index}].decimals must be between 0 and 255`);
  }
  return {
    symbol: string(item.symbol, `tokens[${index}].symbol`),
    address: address(item.address, `tokens[${index}].address`),
    decimals,
  };
}

function parsePool(value: unknown, index: number): PoolConfig {
  const item = record(value, `pools[${index}]`);
  return {
    id: string(item.id, `pools[${index}].id`),
    dex: string(item.dex, `pools[${index}].dex`),
    address: address(item.address, `pools[${index}].address`),
    token0: string(item.token0, `pools[${index}].token0`),
    token1: string(item.token1, `pools[${index}].token1`),
    feeBps: bps(item.feeBps, `pools[${index}].feeBps`),
  };
}

function parseMarket(value: unknown, index: number): MarketConfig {
  const item = record(value, `markets[${index}]`);
  return {
    id: string(item.id, `markets[${index}].id`),
    baseToken: string(item.baseToken, `markets[${index}].baseToken`),
    quoteToken: string(item.quoteToken, `markets[${index}].quoteToken`),
    poolIds: stringArray(item.poolIds, `markets[${index}].poolIds`),
    amounts: stringArray(item.amounts, `markets[${index}].amounts`),
  };
}

function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contains duplicate values`);
  }
}

function validateReferences(config: MonitorConfig): void {
  unique(
    config.tokens.map((token) => token.symbol),
    'token symbols',
  );
  unique(
    config.pools.map((pool) => pool.id),
    'pool ids',
  );
  unique(
    config.markets.map((market) => market.id),
    'market ids',
  );

  const tokens = new Map(config.tokens.map((token) => [token.symbol, token]));
  const pools = new Map(config.pools.map((pool) => [pool.id, pool]));
  for (const pool of config.pools) {
    if (!tokens.has(pool.token0) || !tokens.has(pool.token1)) {
      throw new Error(`pool ${pool.id} references an unknown token`);
    }
    if (pool.token0 === pool.token1) {
      throw new Error(`pool ${pool.id} must contain two different tokens`);
    }
  }
  for (const market of config.markets) {
    if (!tokens.has(market.baseToken) || !tokens.has(market.quoteToken)) {
      throw new Error(`market ${market.id} references an unknown token`);
    }
    if (market.poolIds.length < 2) {
      throw new Error(`market ${market.id} needs at least two pools`);
    }
    for (const poolId of market.poolIds) {
      const pool = pools.get(poolId);
      if (!pool) throw new Error(`market ${market.id} references ${poolId}`);
      const symbols = new Set([pool.token0, pool.token1]);
      if (!symbols.has(market.baseToken) || !symbols.has(market.quoteToken)) {
        throw new Error(`pool ${poolId} does not match market ${market.id}`);
      }
    }
  }
}

export async function loadConfig(path: string): Promise<MonitorConfig> {
  const absolutePath = resolve(path);
  const raw = record(JSON.parse(await readFile(absolutePath, 'utf8')) as unknown, 'config');
  const chain = record(raw.chain, 'chain');
  if (!Array.isArray(raw.tokens) || !Array.isArray(raw.pools) || !Array.isArray(raw.markets)) {
    throw new Error('tokens, pools and markets must be arrays');
  }
  const config: MonitorConfig = {
    chain: {
      id: integer(chain.id, 'chain.id'),
      name: string(chain.name, 'chain.name'),
      httpRpcEnv: string(chain.httpRpcEnv, 'chain.httpRpcEnv'),
      wsRpcEnv: string(chain.wsRpcEnv, 'chain.wsRpcEnv'),
    },
    statePath: resolve(dirname(absolutePath), string(raw.statePath, 'statePath')),
    flashLoanPremiumBps: bps(raw.flashLoanPremiumBps, 'flashLoanPremiumBps'),
    fixedCostBase: string(raw.fixedCostBase, 'fixedCostBase'),
    minNetProfitBase: string(raw.minNetProfitBase, 'minNetProfitBase'),
    logAllEvaluations: raw.logAllEvaluations === undefined ? false : Boolean(raw.logAllEvaluations),
    tokens: raw.tokens.map(parseToken),
    pools: raw.pools.map(parsePool),
    markets: raw.markets.map(parseMarket),
  };
  validateReferences(config);
  return config;
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing environment variable ${name}`);
  return value;
}
