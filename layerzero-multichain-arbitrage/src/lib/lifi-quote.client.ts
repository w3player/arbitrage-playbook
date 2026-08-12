import { createClient, getQuote, HTTPError, SDKError } from '@lifi/sdk';
import type { SDKClient } from '@lifi/sdk';
import type { LiFiStep } from '@lifi/types';

export type LifiQuoteMode = 'exact-input' | 'exact-output';

export interface LifiQuoteRequest {
  chainId: number;
  fromToken: string;
  toToken: string;
  amount: string;
  mode: LifiQuoteMode;
}

export interface LifiQuoteError {
  code: string;
  message: string;
  httpStatus?: number;
  body?: unknown;
}

export interface LifiQuoteResult {
  requestedAt: Date;
  receivedAt: Date;
  durationMs: number;
  response?: LiFiStep;
  error?: LifiQuoteError;
}

export interface LifiQuoteClientOptions {
  apiKey?: string;
  integrator: string;
  fromAddress: string;
  requestTimeoutMs: number;
  slippage: number;
}

export class LifiQuoteClient {
  private readonly client: SDKClient;

  constructor(private readonly options: LifiQuoteClientOptions) {
    this.client = createClient({
      integrator: options.integrator,
      disableVersionCheck: true,
      preloadChains: false,
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
    });
  }

  async quote(request: LifiQuoteRequest): Promise<LifiQuoteResult> {
    const startedAt = new Date();
    const params = {
      fromChain: request.chainId,
      toChain: request.chainId,
      fromToken: request.fromToken,
      toToken: request.toToken,
      fromAddress: this.options.fromAddress,
      slippage: this.options.slippage,
      skipSimulation: false,
      swapStepTimingStrategies: ['minWaitTime-300-1-300' as const],
    };

    try {
      const response =
        request.mode === 'exact-output'
          ? await getQuote(
              this.client,
              { ...params, toAmount: request.amount },
              { signal: AbortSignal.timeout(this.options.requestTimeoutMs) },
            )
          : await getQuote(
              this.client,
              { ...params, fromAmount: request.amount },
              { signal: AbortSignal.timeout(this.options.requestTimeoutMs) },
            );
      const receivedAt = new Date();
      return {
        requestedAt: startedAt,
        receivedAt,
        durationMs: receivedAt.getTime() - startedAt.getTime(),
        response,
      };
    } catch (error) {
      const receivedAt = new Date();
      return {
        requestedAt: startedAt,
        receivedAt,
        durationMs: receivedAt.getTime() - startedAt.getTime(),
        error: this.normalizeError(error),
      };
    }
  }

  private normalizeError(error: unknown): LifiQuoteError {
    const cause = error instanceof SDKError ? error.cause : error;
    if (cause instanceof HTTPError) {
      return {
        code: String(cause.responseBody?.code ?? cause.code ?? cause.status),
        message: cause.responseBody?.message ?? cause.message,
        httpStatus: cause.status,
        ...(cause.responseBody === undefined
          ? {}
          : { body: cause.responseBody }),
      };
    }

    if (cause instanceof Error) {
      return { code: cause.name, message: cause.message };
    }
    return { code: 'UNKNOWN', message: String(cause) };
  }
}

export function quoteCostUsdMicros(
  costs: readonly { amountUSD?: string; included?: boolean }[] | undefined,
  included?: boolean,
): bigint {
  return (costs ?? []).reduce((total, cost) => {
    if (included !== undefined && Boolean(cost.included) !== included) {
      return total;
    }
    return total + parseDecimal(cost.amountUSD ?? '0', 6);
  }, 0n);
}

export function parseDecimal(value: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) {
    return 0n;
  }
  const [whole, fraction = ''] = value.split('.');
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals))
  );
}
