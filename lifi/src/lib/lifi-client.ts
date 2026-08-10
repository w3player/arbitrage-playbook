import { randomUUID } from 'node:crypto';
import type { Step } from '@lifi/types';
import ky, { HTTPError } from 'ky';
import type { AppConfig } from '../config.js';
import type { QuoteErrorRecord, QuoteRequestRecord, QuoteTask, RawQuoteRecord } from '../types/types.js';

export interface QuoteClient {
  quote(task: QuoteTask): Promise<RawQuoteRecord>;
}

export function createQuoteRequest(task: QuoteTask, config: AppConfig['lifi']): QuoteRequestRecord {
  return {
    ...task,
    fromAddress: config.fromAddress,
    slippage: config.slippage,
    skipSimulation: config.skipSimulation,
  };
}

export function createQuoteRecord(
  started: number,
  request: QuoteRequestRecord,
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

export function createUnknownQuoteError(error: unknown): QuoteErrorRecord {
  return { name: error instanceof Error ? error.name : 'UnknownError', message: String(error) };
}

function toError(error: unknown): QuoteErrorRecord {
  if (!(error instanceof HTTPError)) {
    return createUnknownQuoteError(error);
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

export class LifiClient implements QuoteClient {
  private readonly http;

  constructor(private readonly config: AppConfig['lifi']) {
    const apiKey = process.env[config.apiKeyEnv];
    this.http = ky.create({
      prefix: `${config.baseUrl.replace(/\/$/, '')}/`,
      timeout: config.requestTimeoutMs,
      headers: {
        'x-lifi-integrator': config.integrator,
        ...(apiKey ? { 'x-lifi-api-key': apiKey } : {}),
      },
      retry: { limit: 2, methods: ['get'], statusCodes: [429, 500, 502, 503, 504], backoffLimit: 2_000 },
    });
  }

  async quote(task: QuoteTask): Promise<RawQuoteRecord> {
    const started = Date.now();
    const request = createQuoteRequest(task, this.config);
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
            integrator: this.config.integrator,
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
      return createQuoteRecord(started, request, { response });
    } catch (error) {
      return createQuoteRecord(started, request, { error: toError(error) });
    }
  }
}
