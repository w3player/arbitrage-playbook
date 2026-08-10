import { createClient, getQuote, HTTPError, SDKError } from '@lifi/sdk';
import type { AppConfig } from '../config.js';
import type { QuoteErrorRecord, QuoteTask, RawQuoteRecord } from '../types/types.js';
import { createQuoteRecord, createQuoteRequest, createUnknownQuoteError, type QuoteClient } from './lifi-client.js';

function toError(error: unknown): QuoteErrorRecord {
  const cause = error instanceof SDKError ? error.cause : error;
  if (!(cause instanceof HTTPError)) return createUnknownQuoteError(error);

  return {
    name: 'LifiSdkHttpError',
    message: cause.responseBody?.message ?? cause.message,
    httpStatus: cause.status,
    lifiCode: String(cause.responseBody?.code ?? cause.code),
    ...(cause.responseBody === undefined ? {} : { responseBody: cause.responseBody }),
  };
}

export class LifiSdkClient implements QuoteClient {
  private readonly client;

  constructor(private readonly config: AppConfig['lifi']) {
    const apiKey = process.env[config.apiKeyEnv];
    this.client = createClient({
      integrator: config.integrator,
      apiUrl: config.baseUrl.replace(/\/$/, ''),
      disableVersionCheck: true,
      preloadChains: false,
      ...(apiKey ? { apiKey } : {}),
    });
  }

  async quote(task: QuoteTask): Promise<RawQuoteRecord> {
    const started = Date.now();
    const request = createQuoteRequest(task, this.config);
    const params = {
      fromChain: task.fromChainId,
      toChain: task.toChainId,
      fromToken: task.fromTokenAddress,
      toToken: task.toTokenAddress,
      fromAddress: this.config.fromAddress,
      slippage: this.config.slippage,
      skipSimulation: this.config.skipSimulation,
      ...(this.config.sameChainTimingStrategy
        ? { swapStepTimingStrategies: [this.config.sameChainTimingStrategy] }
        : {}),
      ...(task.stream === 'rebalance' && this.config.routeTimingStrategy
        ? { routeTimingStrategies: [this.config.routeTimingStrategy] }
        : {}),
    };
    const options = { signal: AbortSignal.timeout(this.config.requestTimeoutMs) };

    try {
      const response =
        task.amountMode === 'exact-output'
          ? await getQuote(this.client, { ...params, toAmount: task.amount }, options)
          : await getQuote(this.client, { ...params, fromAmount: task.amount }, options);
      return createQuoteRecord(started, request, { response });
    } catch (error) {
      return createQuoteRecord(started, request, { error: toError(error) });
    }
  }
}
