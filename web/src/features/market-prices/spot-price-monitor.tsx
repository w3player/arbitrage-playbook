import { AlertTriangle, ArrowRight, Calculator, CircleDashed, ExternalLink, RefreshCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { getPrices, getPriceScanStatus, triggerPriceScan } from '@/features/prices/api';
import type { PricesResponse, PriceScanStatus } from '@/features/prices/types';
import { CopyAddress } from '@/features/scanner/copy-address';
import { chainLabels, formatDateTime } from '@/lib/format';

import { getSpotPrices } from './api';
import type { SpotAssetPrice, SpotMarket, SpotPricesResponse } from './types';

export function SpotPriceMonitor() {
  const [data, setData] = useState<SpotPricesResponse | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [measuringAssetId, setMeasuringAssetId] = useState<number | null>(null);
  const [measurementAsset, setMeasurementAsset] = useState<SpotAssetPrice | null>(null);
  const [measurementOpen, setMeasurementOpen] = useState(false);
  const [measurementRunId, setMeasurementRunId] = useState<string | null>(null);
  const [measurementStatus, setMeasurementStatus] = useState<PriceScanStatus | null>(null);
  const [measurementPrices, setMeasurementPrices] = useState<PricesResponse | null>(null);
  const [measurementError, setMeasurementError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getSpotPrices());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const assets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data?.assets ?? [];
    return (data?.assets ?? []).filter(
      (asset) =>
        asset.symbol.toLowerCase().includes(normalized) ||
        asset.name.toLowerCase().includes(normalized) ||
        asset.markets.some(
          (market) =>
            market.chainName.toLowerCase().includes(normalized) ||
            market.tokenAddress.toLowerCase().includes(normalized),
        ),
    );
  }, [data?.assets, query]);
  const comparableAssets = useMemo(() => assets.filter((asset) => asset.comparableChains >= 2), [assets]);
  const incomparableAssets = useMemo(() => assets.filter((asset) => asset.comparableChains < 2), [assets]);
  const closeMeasurement = useCallback(() => setMeasurementOpen(false), []);

  async function handleMeasure(asset: SpotAssetPrice) {
    if (measuringAssetId === asset.assetId) {
      setMeasurementOpen(true);
      return;
    }

    setMeasuringAssetId(asset.assetId);
    setMeasurementAsset(asset);
    setMeasurementOpen(true);
    setMeasurementRunId(null);
    setMeasurementStatus(null);
    setMeasurementPrices(null);
    setMeasurementError(null);
    try {
      const result = await triggerPriceScan(asset.assetId);
      if (result.status === 'already_running') {
        setMeasurementError('已有真实测算正在运行，请等待完成后再测算这个资产。');
        setMeasuringAssetId(null);
        return;
      }
      if (!result.runId) {
        throw new Error('测算已启动，但服务未返回任务编号。');
      }
      setMeasurementRunId(result.runId);
    } catch (requestError) {
      setMeasurementError(requestError instanceof Error ? requestError.message : String(requestError));
      setMeasuringAssetId(null);
    }
  }

  useEffect(() => {
    if (!measurementRunId) return;

    let cancelled = false;
    let timer: number | undefined;

    async function pollMeasurement() {
      try {
        const nextStatus = await getPriceScanStatus();
        if (cancelled) return;
        if (nextStatus.runId !== measurementRunId) {
          throw new Error('测算任务状态已被另一任务替代，请重新测算。');
        }
        setMeasurementStatus(nextStatus);
        if (nextStatus.state === 'running') {
          timer = window.setTimeout(() => void pollMeasurement(), 1_500);
          return;
        }
        if (nextStatus.state === 'failed') {
          setMeasurementError(nextStatus.error ?? '真实测算失败。');
        } else {
          const prices = await getPrices();
          if (!cancelled) setMeasurementPrices(prices);
        }
        if (!cancelled) setMeasuringAssetId(null);
      } catch (requestError) {
        if (cancelled) return;
        setMeasurementError(requestError instanceof Error ? requestError.message : String(requestError));
        setMeasuringAssetId(null);
      }
    }

    void pollMeasurement();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [measurementRunId]);

  return (
    <div className="mx-auto w-full max-w-[110rem] px-5 py-4">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">全链现价</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            直接读取各链 DEX 池价，不经过 LI.FI；用于发现价格偏离，不代表可成交报价。
          </p>
        </div>
        <Button className="h-8 px-3 text-xs" disabled={loading} onClick={() => void load()} type="button">
          <RefreshCw className={loading ? 'animate-spin' : undefined} data-icon="inline-start" />
          {loading ? '扫描中' : '刷新现价'}
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-5 divide-x overflow-hidden rounded-lg border bg-card">
        <Metric label="多链资产" value={data?.summary.assets ?? 0} />
        <Metric label="已取得池价" tone="text-emerald-700" value={data?.summary.pricedDeployments ?? 0} />
        <Metric label="可比较资产" tone="text-blue-700" value={data?.summary.comparableAssets ?? 0} />
        <Metric label="缺少市场" tone="text-amber-700" value={data?.summary.missingDeployments ?? 0} />
        <Metric
          label="最大价格偏离"
          tone="text-emerald-700"
          value={
            data?.summary.maxSpreadPct === null || data?.summary.maxSpreadPct === undefined
              ? '—'
              : `${formatPercent(data.summary.maxSpreadPct)}`
          }
        />
      </dl>

      {error ? (
        <div
          className="mt-3 flex min-h-10 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-xs text-red-800"
          role="alert"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
          <Button className="ms-auto" onClick={() => void load()} size="xs" type="button" variant="outline">
            重试
          </Button>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border bg-card p-2">
        <label className="relative w-full max-w-xl">
          <span className="sr-only">搜索现价资产</span>
          <Search
            className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            className="h-8 w-full rounded-md border bg-background ps-8 pe-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/20"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索币种、链或合约地址"
            type="search"
            value={query}
          />
        </label>
        <div className="shrink-0 text-right">
          <p className="font-mono text-[10px] text-muted-foreground">
            DexScreener · {formatDateTime(data?.observedAt ?? null)}
          </p>
          <p className="mt-0.5 text-[9px] text-muted-foreground">每条链选择流动性最高的池</p>
        </div>
      </div>

      <section className="mt-3 overflow-hidden rounded-lg border bg-card" aria-labelledby="spot-table-title">
        <div className="flex h-10 items-center justify-between gap-4 border-b px-3">
          <h2 className="text-sm font-semibold" id="spot-table-title">
            可比较的多链市场
          </h2>
          <p className="font-mono text-[10px] text-muted-foreground">
            显示 {comparableAssets.length} / {data?.summary.comparableAssets ?? 0}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
            <thead className="bg-muted/60 text-[10px] text-muted-foreground">
              <tr>
                <Header>资产</Header>
                {(data?.chains ?? []).map((chain) => (
                  <Header key={chain.chainName}>{chainName(chain.chainName)}</Header>
                ))}
                <Header>最低 → 最高</Header>
                <Header>价格偏离</Header>
                <Header>可成交验证</Header>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && !data ? <LoadingRows columns={6} /> : null}
              {!loading && !error && comparableAssets.length === 0 ? (
                <tr>
                  <td
                    className="h-36 text-center text-xs text-muted-foreground"
                    colSpan={(data?.chains.length ?? 3) + 4}
                  >
                    没有满足两条有效市场的资产。
                  </td>
                </tr>
              ) : null}
              {comparableAssets.map((asset) => (
                <AssetRow
                  asset={asset}
                  chains={data?.chains.map((chain) => chain.chainName) ?? []}
                  measuringAssetId={measuringAssetId}
                  onMeasure={handleMeasure}
                  key={asset.assetId}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {incomparableAssets.length > 0 ? (
        <details className="mt-3 overflow-hidden rounded-lg border bg-card">
          <summary className="flex min-h-10 cursor-pointer items-center gap-2 px-3 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
            <AlertTriangle className="size-3.5 text-amber-600" aria-hidden="true" />
            不可比较资产 {incomparableAssets.length} 个
            <span className="text-[10px] font-normal text-muted-foreground">少于两条流动性达到 $10,000 的市场</span>
          </summary>
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
              <thead className="bg-muted/60 text-[10px] text-muted-foreground">
                <tr>
                  <Header>资产</Header>
                  {(data?.chains ?? []).map((chain) => (
                    <Header key={chain.chainName}>{chainName(chain.chainName)}</Header>
                  ))}
                  <Header>比较状态</Header>
                  <Header>价格偏离</Header>
                  <Header>可成交验证</Header>
                </tr>
              </thead>
              <tbody className="divide-y">
                {incomparableAssets.map((asset) => (
                  <AssetRow
                    asset={asset}
                    chains={data?.chains.map((chain) => chain.chainName) ?? []}
                    measuringAssetId={measuringAssetId}
                    onMeasure={handleMeasure}
                    key={asset.assetId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
        价格偏离仅使用流动性不少于 $10,000 的市场计算；尚未计入下单量造成的滑点、Gas、跨链费和跨链等待期间的波动。
      </p>

      {measurementOpen && measurementAsset ? (
        <MeasurementDialog
          asset={measurementAsset}
          error={measurementError}
          onClose={closeMeasurement}
          prices={measurementPrices}
          runId={measurementRunId}
          status={measurementStatus}
        />
      ) : null}
    </div>
  );
}

function AssetRow({
  asset,
  chains,
  measuringAssetId,
  onMeasure,
}: {
  asset: SpotAssetPrice;
  chains: string[];
  measuringAssetId: number | null;
  onMeasure: (asset: SpotAssetPrice) => Promise<void>;
}) {
  const measuring = measuringAssetId === asset.assetId;
  const measurable = asset.comparableChains >= 2 && asset.spreadPct !== null;

  return (
    <tr className="align-top transition-colors hover:bg-muted/35">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-semibold">{asset.symbol}</span>
          {asset.comparableChains < 2 ? (
            <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">
              不可比较
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 max-w-44 truncate text-[10px] text-muted-foreground" title={asset.name}>
          {asset.name}
        </div>
        <div className="mt-1 font-mono text-[9px] text-muted-foreground">
          {asset.pricedChains}/{asset.markets.length} 链有价 · {asset.comparableChains} 链可比
        </div>
      </td>
      {chains.map((chain) => (
        <MarketCell key={chain} market={asset.markets.find((market) => market.chainName === chain) ?? null} />
      ))}
      <td className="px-3 py-2.5">
        {asset.lowChainName && asset.highChainName ? (
          <>
            <div className="flex items-center gap-1.5 font-medium">
              <span>{chainName(asset.lowChainName)}</span>
              <ArrowRight className="size-3 text-muted-foreground" aria-hidden="true" />
              <span>{chainName(asset.highChainName)}</span>
            </div>
            <div className="mt-1 font-mono text-[9px] text-muted-foreground tabular-nums">
              {formatUsd(asset.lowPriceUsd)} → {formatUsd(asset.highPriceUsd)}
            </div>
          </>
        ) : (
          <span className="text-[10px] font-medium text-amber-700">不足两条有效市场</span>
        )}
      </td>
      <td className="px-3 py-2.5 font-mono tabular-nums">
        {asset.spreadPct === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            <div className="font-semibold text-emerald-700">{formatPercent(asset.spreadPct)}</div>
            <div className="mt-1 text-[9px] text-muted-foreground">未扣交易成本</div>
          </>
        )}
      </td>
      <td className="px-3 py-2.5">
        <Button
          aria-label={`真实测算 ${asset.symbol} 的可成交价差`}
          className="h-8 px-2.5 text-xs"
          disabled={!measurable || (measuringAssetId !== null && !measuring)}
          onClick={() => void onMeasure(asset)}
          title={measurable ? '查询约 $500 档 LI.FI 可成交报价，不会发起交易' : '至少需要两条可比较市场'}
          type="button"
          variant="outline"
        >
          <Calculator className={measuring ? 'animate-pulse' : undefined} data-icon="inline-start" />
          {measuring ? '查看测算' : '真实测算'}
        </Button>
        <div className="mt-1 text-[9px] text-muted-foreground">约 $500 · 含 Gas 与额外费</div>
      </td>
    </tr>
  );
}

function MeasurementDialog({
  asset,
  error,
  onClose,
  prices,
  runId,
  status,
}: {
  asset: SpotAssetPrice;
  error: string | null;
  onClose: () => void;
  prices: PricesResponse | null;
  runId: string | null;
  status: PriceScanStatus | null;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const running = !error && !(status?.state === 'idle' && prices !== null);
  const runPrices = prices?.summary.runId === runId ? prices : null;
  const spreads = runPrices?.spreads.filter((spread) => spread.assetId === asset.assetId) ?? [];
  const failures = runPrices?.failures.filter((failure) => failure.assetId === asset.assetId) ?? [];
  const progress = status?.summary?.assets
    ? Math.min(100, (status.summary.completedAssets / status.summary.assets) * 100)
    : 0;

  useEffect(() => {
    closeButton.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-describedby="measurement-dialog-description"
        aria-labelledby="measurement-dialog-title"
        aria-modal="true"
        className="w-full max-w-3xl overflow-hidden rounded-xl border bg-card shadow-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-5 border-b px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Calculator className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-semibold" id="measurement-dialog-title">
                  {asset.symbol} 真实价差测算
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground" id="measurement-dialog-description">
                  LI.FI 约 $500 档可成交报价 · 相同 Token 数量双向比较
                </p>
              </div>
            </div>
          </div>
          <Button aria-label="关闭真实测算弹层" onClick={onClose} ref={closeButton} size="icon-sm" variant="ghost">
            <X aria-hidden="true" />
          </Button>
        </div>

        <div className="max-h-[70dvh] overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-3 divide-x rounded-lg border bg-muted/25">
            <DialogMetric label="池价偏离" value={asset.spreadPct === null ? '—' : formatPercent(asset.spreadPct)} />
            <DialogMetric label="可比链" value={`${asset.comparableChains} 条`} />
            <DialogMetric
              label="测算状态"
              tone={error ? 'text-red-700' : running ? 'text-blue-700' : 'text-emerald-700'}
              value={
                error ? '失败' : running ? '报价中' : spreads.length > 0 ? '已完成' : runId ? '无完整报价' : '启动中'
              }
            />
          </div>

          {running ? (
            <div className="mt-4 rounded-lg border bg-background p-4" aria-live="polite">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="inline-flex items-center gap-2 font-medium">
                  <CircleDashed className="size-4 animate-spin text-primary" aria-hidden="true" />
                  正在查询真实可成交报价
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {status?.currentAsset ?? asset.symbol} · {Math.round(progress)}%
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${Math.max(6, progress)}%` }}
                />
              </div>
              <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
                正在分别获取各链买入最大支付与卖出最小到账，并计入 Gas 和额外费用。
              </p>
            </div>
          ) : null}

          {error ? (
            <div
              className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">真实测算未完成</p>
                <p className="mt-1 leading-5">{error}</p>
              </div>
            </div>
          ) : null}

          {!running && !error && runId && spreads.length === 0 ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
              <p className="font-semibold">未取得完整的双向可成交报价</p>
              <p className="mt-1 leading-5">
                本次完成 {status?.summary?.succeededQuotes ?? 0} 条报价、失败 {status?.summary?.failedQuotes ?? 0}{' '}
                条；池价偏离暂时不能转化为可验证的交易价差。
              </p>
            </div>
          ) : null}

          {spreads.length > 0 ? (
            <div className="mt-4 space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold">可成交测算结果</h3>
                <span className="font-mono text-[10px] text-muted-foreground">按直接净利润降序</span>
              </div>
              {spreads.map((spread) => (
                <div
                  className="grid grid-cols-[1.3fr_1fr_1fr_1fr] gap-3 rounded-lg border bg-background p-3"
                  key={spread.id}
                >
                  <div>
                    <p className="text-[10px] text-muted-foreground">方向</p>
                    <p className="mt-1 text-xs font-semibold">
                      {chainName(spread.buy.chainName)} → {chainName(spread.sell.chainName)}
                    </p>
                    <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                      {spread.tokenAmount} {spread.symbol}
                    </p>
                  </div>
                  <ResultValue label="毛价差" value={formatSignedUsd(spread.grossProfitUsd)} />
                  <ResultValue label="Gas + 额外费" value={formatUsd(spread.directCostUsd)} />
                  <ResultValue
                    label="直接净价差"
                    tone={Number(spread.directProfitUsd) > 0 ? 'text-emerald-700' : 'text-red-700'}
                    value={`${formatSignedUsd(spread.directProfitUsd)} · ${formatSignedBps(spread.directSpreadBps)}`}
                  />
                </div>
              ))}
            </div>
          ) : null}

          {failures.length > 0 ? (
            <details className="mt-4 rounded-lg border bg-background">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
                报价失败 {failures.length} 条
              </summary>
              <div className="space-y-2 border-t p-3">
                {failures.map((failure, index) => (
                  <div
                    className="grid grid-cols-[7rem_4rem_1fr] gap-3 text-[10px]"
                    key={`${failure.deploymentId}:${failure.side}:${index}`}
                  >
                    <span className="font-medium">{chainName(failure.chainName)}</span>
                    <span className="font-mono text-red-700">{failure.code}</span>
                    <span className="text-muted-foreground">{failure.message}</span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-4 border-t bg-muted/25 px-5 py-3">
          <p className="text-[10px] text-muted-foreground">仅查询报价，不签名、不授权、不会发送链上交易。</p>
          <Button onClick={onClose} size="sm" type="button" variant="outline">
            关闭
          </Button>
        </div>
      </section>
    </div>
  );
}

function DialogMetric({ label, tone, value }: { label: string; tone?: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-sm font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

function ResultValue({ label, tone, value }: { label: string; tone?: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-[11px] font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

function MarketCell({ market }: { market: SpotMarket | null }) {
  if (!market) {
    return <td className="px-3 py-2.5 text-[10px] text-muted-foreground">未部署</td>;
  }
  if (market.status !== 'priced') {
    return (
      <td className="px-3 py-2.5">
        <div className="text-[10px] font-medium text-amber-700">
          {market.status === 'failed' ? '查询失败' : '未发现池'}
        </div>
        <div className="mt-1">
          <CopyAddress address={market.tokenAddress} label="Token" />
        </div>
      </td>
    );
  }

  return (
    <td className="px-3 py-2.5">
      <div className="font-mono text-[12px] font-semibold tabular-nums">{formatUsd(market.priceUsd)}</div>
      <div className="mt-1 flex gap-2 font-mono text-[9px] text-muted-foreground tabular-nums">
        <span>LP {compactUsd(market.liquidityUsd)}</span>
        <span>V24 {compactUsd(market.volume24hUsd)}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium">{market.dexId}</span>
        {!market.comparable ? (
          <span className="rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[9px] font-medium text-amber-800">
            低流动性
          </span>
        ) : null}
        <span className={changeTone(market.priceChange24hPct)}>
          24h {formatSignedPercent(market.priceChange24hPct)}
        </span>
        {market.pairUrl ? (
          <a
            aria-label={`打开 ${market.dexId ?? 'DEX'} 池子`}
            className="rounded p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            href={market.pairUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : null}
      </div>
      <div className="mt-0.5">
        <CopyAddress address={market.tokenAddress} label="Token" />
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

function LoadingRows({ columns }: { columns: number }) {
  return Array.from({ length: 7 }, (_, index) => (
    <tr key={index}>
      <td className="px-3 py-3" colSpan={columns}>
        <div className="h-8 animate-pulse rounded bg-muted" />
      </td>
    </tr>
  ));
}

function Metric({ label, tone, value }: { label: string; tone?: string; value: number | string }) {
  return (
    <div className="px-3 py-2.5">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${tone ?? ''}`}>{value}</dd>
    </div>
  );
}

function chainName(value: string): string {
  return chainLabels[value] ?? value;
}

function formatUsd(value: string | null): string {
  if (value === null) return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (number >= 1) return `$${number.toLocaleString('en-US', { maximumFractionDigits: 6 })}`;
  if (number >= 0.0001) return `$${number.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')}`;
  return `$${number.toExponential(4)}`;
}

function compactUsd(value: string | null): string {
  if (value === null) return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(number);
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}

function formatSignedUsd(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return `${number >= 0 ? '+' : '-'}$${Math.abs(number).toLocaleString('en-US', { maximumFractionDigits: 4 })}`;
}

function formatSignedBps(value: number): string {
  return `${value >= 0 ? '+' : ''}${value} bps`;
}

function formatSignedPercent(value: number | null): string {
  if (value === null) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function changeTone(value: number | null): string {
  const tone = value === null ? 'text-muted-foreground' : value >= 0 ? 'text-emerald-700' : 'text-red-700';
  return `font-mono text-[9px] tabular-nums ${tone}`;
}
