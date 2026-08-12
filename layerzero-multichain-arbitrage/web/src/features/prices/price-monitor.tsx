import { AlertTriangle, ArrowRight, CircleDashed, RefreshCw, Route } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { CopyAddress } from '@/features/scanner/copy-address';
import { useScanner } from '@/features/scanner/scanner-provider';
import { chainLabels, formatDateTime } from '@/lib/format';

import { getPrices, getPriceScanStatus, triggerPriceScan } from './api';
import type { CrosschainSpread, PricesResponse, PriceScanStatus } from './types';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function PriceMonitor() {
  const { assets } = useScanner();
  const [prices, setPrices] = useState<PricesResponse | null>(null);
  const [status, setStatus] = useState<PriceScanStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousState = useRef<PriceScanStatus['state'] | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextPrices, nextStatus] = await Promise.all([getPrices(), getPriceScanStatus()]);
      setPrices(nextPrices);
      setStatus(nextStatus);
      setError(null);
      previousState.current = nextStatus.state;
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const nextStatus = await getPriceScanStatus();
      const completed = previousState.current === 'running' && nextStatus.state !== 'running';
      previousState.current = nextStatus.state;
      setStatus(nextStatus);
      if (completed || nextStatus.state === 'running') {
        setPrices(await getPrices());
      }
      setError(null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => void poll(), status?.state === 'running' ? 3_000 : 15_000);
    return () => window.clearInterval(timer);
  }, [poll, status?.state]);

  async function handleScan() {
    setTriggering(true);
    setError(null);
    try {
      await triggerPriceScan();
      const nextStatus = await getPriceScanStatus();
      previousState.current = nextStatus.state;
      setStatus(nextStatus);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setTriggering(false);
    }
  }

  const running = status?.state === 'running';
  const visibleError = error ?? status?.error ?? null;
  const progress = useMemo(() => {
    const summary = status?.summary;
    if (!summary || summary.assets === 0) return 0;
    return Math.min(100, (summary.completedAssets / summary.assets) * 100);
  }, [status?.summary]);

  return (
    <div className="mx-auto w-full max-w-[110rem] px-5 py-4">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">跨链价差</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            LI.FI 聚合同链 DEX 报价；仅比较 LayerZero 双向路径上的相同 Token 数量。
          </p>
        </div>
        <Button
          className="h-8 px-3 text-xs"
          disabled={running || triggering}
          onClick={() => void handleScan()}
          type="button"
        >
          <RefreshCw className={running ? 'animate-spin' : undefined} data-icon="inline-start" />
          {running ? '抓取中' : '抓取价格'}
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-5 divide-x overflow-hidden rounded-lg border bg-card">
        <Metric label="可扫描资产" value={assets?.summary.verifiedAssets ?? 0} />
        <Metric label="已报价资产" value={prices?.summary.pricedAssets ?? 0} />
        <Metric label="跨链方向" value={prices?.summary.crosschainSpreads ?? 0} />
        <Metric label="正直接价差" tone="text-emerald-700" value={prices?.summary.positiveSpreads ?? 0} />
        <Metric
          label="抓取状态"
          tone={status?.state === 'failed' ? 'text-red-700' : running ? 'text-blue-700' : undefined}
          value={
            running
              ? `${status?.summary?.completedAssets ?? 0}/${status?.summary?.assets ?? 0}`
              : status?.state === 'failed'
                ? '失败'
                : '空闲'
          }
        />
      </dl>

      {running ? (
        <div className="mt-2 flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-[11px]">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-muted-foreground">
            {status?.currentAsset ?? '准备任务'} · {Math.round(progress)}%
          </span>
        </div>
      ) : null}

      {visibleError ? (
        <div
          className="mt-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          role="alert"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span>{visibleError}</span>
          <Button className="ms-auto" onClick={() => void load()} size="xs" type="button" variant="outline">
            重试
          </Button>
        </div>
      ) : null}

      <section className="mt-3 overflow-hidden rounded-lg border bg-card" aria-labelledby="spread-table-title">
        <div className="flex h-10 items-center justify-between gap-4 border-b px-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-semibold" id="spread-table-title">
              严格同数量报价
            </h2>
            <p className="font-mono text-[10px] text-muted-foreground">
              约 $500 档 · 按直接净价差降序 · {prices?.spreads.length ?? 0} 条
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <CircleDashed className={running ? 'size-3 animate-spin' : 'size-3'} aria-hidden="true" />
            {formatDateTime(prices?.summary.updatedAt ?? null)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] border-collapse text-left text-xs">
            <thead className="bg-muted/60 text-[10px] text-muted-foreground">
              <tr>
                <Header>资产 / 数量</Header>
                <Header>跨链方向</Header>
                <Header>买入最大支付</Header>
                <Header>卖出最小到账</Header>
                <Header>毛价差</Header>
                <Header>Gas + 额外费</Header>
                <Header>直接净价差</Header>
                <Header>同步 / 状态</Header>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? <LoadingRows /> : null}
              {!loading && prices?.spreads.length === 0 ? (
                <tr>
                  <td className="h-40 text-center text-xs text-muted-foreground" colSpan={8}>
                    尚无可组合的跨链报价。点击“抓取价格”后，系统会对已验证的双向 LayerZero 路径查询 LI.FI。
                  </td>
                </tr>
              ) : null}
              {prices?.spreads.map((spread) => (
                <SpreadRow key={spread.id} spread={spread} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {prices && prices.failures.length > 0 ? (
        <details className="mt-3 overflow-hidden rounded-lg border bg-card">
          <summary className="flex min-h-9 cursor-pointer items-center gap-2 px-3 text-xs font-medium">
            <AlertTriangle className="size-3.5 text-amber-600" aria-hidden="true" />
            报价失败 {prices.failures.length} 条
            <span className="text-[10px] font-normal text-muted-foreground">展开查看 LI.FI 返回原因</span>
          </summary>
          <div className="max-h-56 overflow-auto border-t">
            <table className="w-full text-left text-[11px]">
              <tbody className="divide-y">
                {prices.failures.map((failure, index) => (
                  <tr key={`${failure.deploymentId}:${failure.side}:${index}`}>
                    <td className="px-3 py-1.5 font-semibold">{failure.symbol}</td>
                    <td className="px-3 py-1.5">{chainName(failure.chainName)}</td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{failure.side}</td>
                    <td className="px-3 py-1.5 font-mono text-red-700">{failure.code}</td>
                    <td className="max-w-xl truncate px-3 py-1.5 text-muted-foreground" title={failure.message}>
                      {failure.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function SpreadRow({ spread }: { spread: CrosschainSpread }) {
  const positive = spread.status === 'positive';
  const stale = spread.status === 'stale';
  return (
    <tr className="hover:bg-muted/35">
      <td className="px-3 py-2 align-top">
        <div className="font-semibold">{spread.symbol}</div>
        <div className="mt-0.5 max-w-40 truncate text-[10px] text-muted-foreground" title={spread.name}>
          {spread.name}
        </div>
        <div className="mt-1 font-mono text-[10px] tabular-nums">
          {spread.tokenAmount} {spread.symbol}
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex items-center gap-1.5 font-medium">
          <span>{chainName(spread.buy.chainName)}</span>
          <ArrowRight className="size-3 text-muted-foreground" aria-hidden="true" />
          <span>{chainName(spread.sell.chainName)}</span>
        </div>
        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Route className="size-3" aria-hidden="true" />
          双向 L0 peer
        </div>
      </td>
      <LegCell leg={spread.buy} side="买" />
      <LegCell leg={spread.sell} side="卖" />
      <td className="px-3 py-2 align-top font-mono tabular-nums">
        <div
          className={
            Number(spread.grossProfitUsd) > 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'
          }
        >
          {signedUsd(spread.grossProfitUsd)}
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">{signedBps(spread.grossSpreadBps)}</div>
      </td>
      <td className="px-3 py-2 align-top font-mono tabular-nums">
        <div>${formatNumber(spread.directCostUsd, 4)}</div>
        <div className="mt-1 text-[10px] text-muted-foreground">两链 LI.FI 估算</div>
      </td>
      <td className="px-3 py-2 align-top font-mono tabular-nums">
        <div className={positive ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>
          {signedUsd(spread.directProfitUsd)}
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">{signedBps(spread.directSpreadBps)}</div>
      </td>
      <td className="px-3 py-2 align-top">
        <div className="font-mono text-[10px] tabular-nums">偏差 {spread.quoteSkewMs}ms</div>
        <div className="mt-1 flex items-center gap-1.5">
          <span
            className={`inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${stale ? 'border-amber-200 bg-amber-50 text-amber-800' : positive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
          >
            {stale ? '已过期' : positive ? '正价差' : '负价差'}
          </span>
          <span className="text-[9px] text-muted-foreground">{ageLabel(spread.observedAt)}</span>
        </div>
      </td>
    </tr>
  );
}

function LegCell({ leg, side }: { leg: CrosschainSpread['buy']; side: '买' | '卖' }) {
  return (
    <td className="px-3 py-2 align-top">
      <div className="font-mono font-semibold tabular-nums">
        ${formatNumber(leg.amountUsd, 4)}{' '}
        <span className="text-[9px] font-normal text-muted-foreground">{leg.settlementSymbol}</span>
      </div>
      <div className="mt-1 font-mono text-[10px] text-muted-foreground tabular-nums">
        ${formatNumber(leg.unitPriceUsd, 6)} / Token
      </div>
      <div className="mt-1 flex items-center gap-1">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium">{leg.tool}</span>
        <CopyAddress address={leg.tokenAddress} label={`${side}币`} />
      </div>
    </td>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 font-medium" scope="col">
      {children}
    </th>
  );
}

function Metric({ label, tone, value }: { label: string; tone?: string; value: number | string }) {
  return (
    <div className="px-3 py-2.5">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${tone ?? ''}`}>{value}</dd>
    </div>
  );
}

function LoadingRows() {
  return Array.from({ length: 5 }).map((_, row) => (
    <tr className="animate-pulse" key={row}>
      {Array.from({ length: 8 }).map((__, cell) => (
        <td className="px-3 py-3" key={cell}>
          <div className="h-3 rounded bg-muted" />
          <div className="mt-2 h-2 w-2/3 rounded bg-muted" />
        </td>
      ))}
    </tr>
  ));
}

function chainName(value: string): string {
  return chainLabels[value] ?? value;
}

function formatNumber(value: string, maximumFractionDigits: number): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(number);
}

function signedUsd(value: string): string {
  return `${Number(value) >= 0 ? '+' : '-'}$${formatNumber(String(Math.abs(Number(value))), 4)}`;
}

function signedBps(value: number): string {
  return `${value >= 0 ? '+' : ''}${value} bps`;
}

function ageLabel(value: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1_000));
  if (seconds < 60) return `${seconds}s 前`;
  return `${Math.floor(seconds / 60)}m 前`;
}
