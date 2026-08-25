import { AlertTriangle, ArrowRight, Calculator, CircleDashed, ExternalLink, RefreshCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { CopyAddress } from '@/features/scanner/copy-address';
import { chainLabels, formatDateTime } from '@/lib/format';

import { createRpcSnapshot, getSpotPrices } from './api';
import type { RpcSnapshotResponse, SpotAssetPrice, SpotMarket, SpotPricesResponse } from './types';

export function SpotPriceMonitor() {
  const [data, setData] = useState<SpotPricesResponse | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [measuringAssetId, setMeasuringAssetId] = useState<number | null>(null);
  const [measurementAsset, setMeasurementAsset] = useState<SpotAssetPrice | null>(null);
  const [measurementOpen, setMeasurementOpen] = useState(false);
  const [measurementSnapshot, setMeasurementSnapshot] = useState<RpcSnapshotResponse | null>(null);
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
    setMeasurementSnapshot(null);
    setMeasurementError(null);
    try {
      if (!asset.lowChainName || !asset.highChainName) {
        throw new Error('缺少可比较的低价链或高价链。');
      }
      setMeasurementSnapshot(
        await createRpcSnapshot({
          assetId: asset.assetId,
          buyChainName: asset.lowChainName,
          sellChainName: asset.highChainName,
        }),
      );
    } catch (requestError) {
      setMeasurementError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setMeasuringAssetId(null);
    }
  }

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
          loading={measuringAssetId === measurementAsset.assetId}
          onClose={closeMeasurement}
          snapshot={measurementSnapshot}
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
          title={measurable ? '低价链买入、OFT 跨链、高价链卖出的 RPC 快照，不会发起交易' : '至少需要两条可比较市场'}
          type="button"
          variant="outline"
        >
          <Calculator className={measuring ? 'animate-pulse' : undefined} data-icon="inline-start" />
          {measuring ? '查看快照' : 'RPC 快照'}
        </Button>
        <div className="mt-1 text-[9px] text-muted-foreground">约 $500 · 买入 → 跨链 → 卖出</div>
      </td>
    </tr>
  );
}

function MeasurementDialog({
  asset,
  error,
  loading,
  onClose,
  snapshot,
}: {
  asset: SpotAssetPrice;
  error: string | null;
  loading: boolean;
  onClose: () => void;
  snapshot: RpcSnapshotResponse | null;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);

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
                  {asset.symbol} RPC 跨链快照
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground" id="measurement-dialog-description">
                  低价链买入 → LayerZero OFT → 高价链卖出 · 约 $500 档
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
            <DialogMetric
              label="快照方向"
              value={`${chainName(asset.lowChainName ?? '—')} → ${chainName(asset.highChainName ?? '—')}`}
            />
            <DialogMetric
              label="快照结果"
              tone={
                error
                  ? 'text-red-700'
                  : loading
                    ? 'text-blue-700'
                    : snapshot?.summary.status === 'positive'
                      ? 'text-emerald-700'
                      : 'text-red-700'
              }
              value={
                error
                  ? '失败'
                  : loading
                    ? '测算中'
                    : snapshot
                      ? formatSignedUsd(snapshot.summary.netProfitUsd)
                      : '准备中'
              }
            />
          </div>

          {loading ? (
            <div className="mt-4 rounded-lg border bg-background p-4" aria-live="polite">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="inline-flex items-center gap-2 font-medium">
                  <CircleDashed className="size-4 animate-spin text-primary" aria-hidden="true" />
                  正在组合三段只读快照
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">LI.FI + LayerZero RPC</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
              </div>
              <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
                正在查询低价链买入、OFT 实际到账与消息费，再以到账数量查询高价链最低卖出收入。
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
                <p className="font-semibold">RPC 快照未完成</p>
                <p className="mt-1 leading-5">{error}</p>
              </div>
            </div>
          ) : null}

          {snapshot ? (
            <>
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-2">
                <SnapshotStep
                  detail={`${snapshot.buy.tokenAmount} ${snapshot.symbol}`}
                  label="低价链买入"
                  meta={`${snapshot.buy.tool} · Gas ${formatUsd(snapshot.buy.gasUsd)}`}
                  title={chainName(snapshot.buy.chainName)}
                  value={`${formatUsd(snapshot.buy.settlementAmountUsd)} ${snapshot.buy.settlementSymbol}`}
                />
                <ArrowRight className="mt-12 size-4 text-muted-foreground" aria-hidden="true" />
                <SnapshotStep
                  detail={`到账 ${snapshot.bridge.receivedAmount} ${snapshot.symbol}`}
                  label="LayerZero OFT"
                  meta={`区块 ${snapshot.bridge.sourceBlockNumber} · 损耗 ${formatSignedBps(-snapshot.bridge.tokenLossBps)}`}
                  title={`${chainName(snapshot.bridge.sourceChainName)} → ${chainName(snapshot.bridge.destinationChainName)}`}
                  value={`消息费 ${formatUsd(snapshot.bridge.nativeFeeUsd)}`}
                />
                <ArrowRight className="mt-12 size-4 text-muted-foreground" aria-hidden="true" />
                <SnapshotStep
                  detail={`${snapshot.sell.tokenAmount} ${snapshot.symbol}`}
                  label="高价链卖出"
                  meta={`${snapshot.sell.tool} · Gas ${formatUsd(snapshot.sell.gasUsd)}`}
                  title={chainName(snapshot.sell.chainName)}
                  value={`${formatUsd(snapshot.sell.settlementAmountUsd)} ${snapshot.sell.settlementSymbol}`}
                />
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border bg-background">
                <div className="grid grid-cols-4 divide-x border-b bg-muted/30">
                  <ResultValue label="投入" value={formatUsd(snapshot.summary.inputUsd)} />
                  <ResultValue label="跨链后卖出" value={formatUsd(snapshot.summary.outputUsd)} />
                  <ResultValue label="显式成本" value={formatUsd(snapshot.summary.explicitCostUsd)} />
                  <ResultValue label="到账前毛差" value={formatSignedUsd(snapshot.summary.grossProfitUsd)} />
                </div>
                <div className="flex items-center justify-between gap-5 px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold">RPC 快照净利润</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      已计买卖 Gas、未包含费用、LayerZero 消息费与估算 send Gas
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-mono text-lg font-semibold tabular-nums ${snapshot.summary.status === 'positive' ? 'text-emerald-700' : 'text-red-700'}`}
                    >
                      {formatSignedUsd(snapshot.summary.netProfitUsd)}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {formatSignedBps(snapshot.summary.netProfitBps)}
                    </p>
                  </div>
                </div>
              </div>

              <details className="mt-4 rounded-lg border bg-background">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
                  查看跨链费用明细
                </summary>
                <div className="grid grid-cols-4 gap-4 border-t p-3">
                  <ResultValue label="OFT 请求数量" value={`${snapshot.bridge.requestedAmount} ${snapshot.symbol}`} />
                  <ResultValue label="OFT 实际发送" value={`${snapshot.bridge.sentAmount} ${snapshot.symbol}`} />
                  <ResultValue label="精度损耗" value={`${snapshot.bridge.dustAmount} ${snapshot.symbol}`} />
                  <ResultValue label="OFT Token 费" value={`${snapshot.bridge.tokenFeeAmount} ${snapshot.symbol}`} />
                  <ResultValue label="LayerZero 消息费" value={formatUsd(snapshot.bridge.nativeFeeUsd)} />
                  <ResultValue label="源链 send Gas（估）" value={formatUsd(snapshot.bridge.sourceGasUsd)} />
                  <ResultValue label="估算 Gas units" value={formatInteger(snapshot.bridge.sourceGasUnits)} />
                  <ResultValue label="LZ Token fee raw" value={snapshot.bridge.lzTokenFeeRaw} />
                </div>
              </details>

              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] leading-5 text-amber-900">
                <p className="font-semibold">快照边界</p>
                <ul className="mt-1 list-disc ps-4">
                  {snapshot.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-4 border-t bg-muted/25 px-5 py-3">
          <p className="text-[10px] text-muted-foreground">
            仅执行只读报价和 RPC 调用，不签名、不授权、不会发送链上交易。
          </p>
          <Button onClick={onClose} size="sm" type="button" variant="outline">
            关闭
          </Button>
        </div>
      </section>
    </div>
  );
}

function SnapshotStep({
  detail,
  label,
  meta,
  title,
  value,
}: {
  detail: string;
  label: string;
  meta: string;
  title: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-background p-3">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-xs font-semibold">{title}</p>
      <p className="mt-2 font-mono text-[11px] font-semibold tabular-nums">{value}</p>
      <p className="mt-1 font-mono text-[9px] text-muted-foreground tabular-nums">{detail}</p>
      <p className="mt-2 truncate text-[9px] text-muted-foreground" title={meta}>
        {meta}
      </p>
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
    <div className="px-3 py-2.5">
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

function formatInteger(value: string): string {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number.toLocaleString('en-US') : value;
}

function formatSignedPercent(value: number | null): string {
  if (value === null) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function changeTone(value: number | null): string {
  const tone = value === null ? 'text-muted-foreground' : value >= 0 ? 'text-emerald-700' : 'text-red-700';
  return `font-mono text-[9px] tabular-nums ${tone}`;
}
