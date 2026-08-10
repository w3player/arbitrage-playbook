import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppConfig } from '../config.js';
import type { QuoteTask } from '../types/types.js';
import { LifiSdkClient } from './lifi-sdk-client.js';

const config = {
  baseUrl: 'https://li.quest/v1',
  integrator: 'arbitrage-playbook-test',
  fromAddress: '0x000000000000000000000000000000000000dEaD',
  apiKeyEnv: 'LIFI_API_KEY_TEST',
  requestTimeoutMs: 1_000,
  maxConcurrency: 1,
  slippage: 0.003,
  skipSimulation: false,
  sameChainIntervalMs: 1_000,
  rebalanceIntervalMs: 1_000,
  sameChainTimingStrategy: 'minWaitTime-300-1-300',
  routeTimingStrategy: 'minWaitTime-300-1-300',
} satisfies AppConfig['lifi'];

const task = {
  stream: 'same-chain',
  kind: 'buy-exact-output',
  amountMode: 'exact-output',
  assetSymbol: 'WETH',
  fromChainId: 42161,
  toChainId: 42161,
  fromTokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  amount: '100000000000000000',
  amountDecimals: 18,
} satisfies QuoteTask;

test('SDK client sends exact-output quotes to quote/toAmount', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ id: 'quote-id' }), {
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const record = await new LifiSdkClient(config).quote(task);
    const url = new URL(requestedUrl);
    assert.equal(url.pathname, '/v1/quote/toAmount');
    assert.equal(url.searchParams.get('toAmount'), task.amount);
    assert.equal(url.searchParams.get('fromAmount'), null);
    assert.equal(record.error, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SDK client sends exact-input quotes to quote', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ id: 'quote-id' }), {
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const record = await new LifiSdkClient(config).quote({
      ...task,
      kind: 'sell-exact-input',
      amountMode: 'exact-input',
    });
    const url = new URL(requestedUrl);
    assert.equal(url.pathname, '/v1/quote');
    assert.equal(url.searchParams.get('fromAmount'), task.amount);
    assert.equal(url.searchParams.get('toAmount'), null);
    assert.equal(record.error, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
