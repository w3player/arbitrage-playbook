import { randomUUID } from 'node:crypto';
import type { Step } from '@lifi/types';
import ky, { HTTPError } from 'ky';
import type { AppConfig } from '../config.js';
import type { QuoteErrorRecord, QuoteTask, RawQuoteRecord } from '../types/types.js';

function toError(error: unknown): QuoteErrorRecord {
  if (!(error instanceof HTTPError)) {
    return { name: error instanceof Error ? error.name : 'UnknownError', message: String(error) };
  }
  const body = error.data;
  const details = body as { code?: unknown; message?: unknown } | undefined;
  return {
    name: 'LifiHttpError',
    message: typeof details?.message === 'string' ? details.message : error.message,
    httpStatus: error.response.status,
    ...(details?.code === undefined ? {} : { lifiCode: String(details.code) }),
    ...(body === undefined ? {} : { responseBody: body }),
  };
}

export class LifiClient {
  private readonly http;

  constructor(private readonly config: AppConfig['lifi']) {
    const apiKey = process.env[config.apiKeyEnv];
    this.http = ky.create({
      prefix: `${config.baseUrl.replace(/\/$/, '')}/`,
      timeout: config.requestTimeoutMs,
      ...(apiKey ? { headers: { 'x-lifi-api-key': apiKey } } : {}),
      retry: { limit: 2, methods: ['get'], statusCodes: [429, 500, 502, 503, 504], backoffLimit: 2_000 },
    });
  }

  async quote(task: QuoteTask): Promise<RawQuoteRecord> {
    const started = Date.now();
    const request = {
      ...task,
      fromAddress: this.config.fromAddress,
      slippage: this.config.slippage,
      skipSimulation: this.config.skipSimulation,
    };
    try {
      const response = await this.http
        .get(task.amountMode === 'exact-output' ? 'quote/toAmount' : 'quote', {
          searchParams: {
            fromChain: task.fromChainId,
            toChain: task.toChainId,
            fromToken: task.fromTokenAddress,
            toToken: task.toTokenAddress,
            [task.amountMode === 'exact-output' ? 'toAmount' : 'fromAmount']: task.amount,
            fromAddress: this.config.fromAddress,
            slippage: this.config.slippage,
            skipSimulation: this.config.skipSimulation,
            ...(this.config.sameChainTimingStrategy
              ? { swapStepTimingStrategies: this.config.sameChainTimingStrategy }
              : {}),
            ...(task.stream === 'rebalance' && this.config.routeTimingStrategy
              ? { routeTimingStrategies: this.config.routeTimingStrategy }
              : {}),
          },
        })
        .json<Step>();
      return this.record(started, request, { response });
    } catch (error) {
      return this.record(started, request, { error: toError(error) });
    }
  }

  private record(
    started: number,
    request: RawQuoteRecord['request'],
    result: Pick<RawQuoteRecord, 'response' | 'error'>,
  ): RawQuoteRecord {
    const ended = Date.now();
    return {
      schemaVersion: 1,
      id: randomUUID(),
      requestedAt: new Date(started).toISOString(),
      receivedAt: new Date(ended).toISOString(),
      durationMs: ended - started,
      request,
      ...result,
    };
  }
}
