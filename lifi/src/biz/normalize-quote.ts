import type { Step } from '@lifi/types';
import type { NormalizedQuote, RawQuoteRecord } from '../types/types.js';
import { parseUsdCost } from '../utils/index.js';

type Cost = { amountUSD?: string; included?: boolean };

function costUsd(costs: readonly Cost[] | undefined, included?: boolean): bigint {
  return (costs ?? []).reduce((sum, cost) => {
    if (included !== undefined && Boolean(cost.included) !== included) return sum;
    try {
      return sum + parseUsdCost(cost.amountUSD ?? '');
    } catch {
      return sum;
    }
  }, 0n);
}

export function normalizeQuote(record: RawQuoteRecord): NormalizedQuote | undefined {
  if (record.error || !record.response) return undefined;
  const response = record.response as Step;
  const estimate = response.estimate;
  const requestedAtMs = Date.parse(record.requestedAt);
  const receivedAtMs = Date.parse(record.receivedAt);
  if (!estimate || !Number.isFinite(requestedAtMs) || !Number.isFinite(receivedAtMs)) return undefined;

  try {
    return {
      id: record.id,
      stream: record.request.stream,
      kind: record.request.kind,
      assetSymbol: record.request.assetSymbol,
      requestedAtMs,
      receivedAtMs,
      durationMs: record.durationMs,
      fromChainId: record.request.fromChainId,
      toChainId: record.request.toChainId,
      fromTokenAddress: record.request.fromTokenAddress,
      toTokenAddress: record.request.toTokenAddress,
      requestedAmount: BigInt(record.request.amount),
      amountDecimals: record.request.amountDecimals,
      fromAmount: BigInt(estimate.fromAmount),
      toAmount: BigInt(estimate.toAmount),
      toAmountMin: BigInt(estimate.toAmountMin ?? estimate.toAmount),
      gasUsdMicros: costUsd(estimate.gasCosts),
      nonIncludedFeeUsdMicros: costUsd(estimate.feeCosts, false),
      includedFeeUsdMicros: costUsd(estimate.feeCosts, true),
      executionDurationMs: Math.max(0, Math.round((estimate.executionDuration ?? 0) * 1_000)),
      tool: response.tool || 'unknown',
      ...(response.transactionRequest === undefined ? {} : { transactionRequest: response.transactionRequest }),
    };
  } catch {
    return undefined;
  }
}

export function normalizeQuotes(records: RawQuoteRecord[]): NormalizedQuote[] {
  return records
    .map(normalizeQuote)
    .filter((quote): quote is NormalizedQuote => quote !== undefined)
    .sort((left, right) => left.receivedAtMs - right.receivedAtMs);
}
