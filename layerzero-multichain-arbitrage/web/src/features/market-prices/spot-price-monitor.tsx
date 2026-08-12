import { AlertTriangle, ArrowRight, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { CopyAddress } from '@/features/scanner/copy-address';
import { chainLabels, formatDateTime } from '@/lib/format';

import { getSpotPrices } from './api';
import type { SpotAssetPrice, SpotMarket, SpotPricesResponse } from './types';

export function SpotPriceMonitor() {
  const [data, setData] = useState<SpotPricesResponse | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
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
            多链 DEX 市场快照
          </h2>
          <p className="font-mono text-[10px] text-muted-foreground">
            显示 {assets.length} / {data?.assets.length ?? 0}
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
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && !data ? <LoadingRows columns={6} /> : null}
              {!loading && !error && assets.length === 0 ? (
                <tr>
                  <td
                    className="h-36 text-center text-xs text-muted-foreground"
                    colSpan={(data?.chains.length ?? 3) + 3}
                  >
                    没有可展示的多链池价。
                  </td>
                </tr>
              ) : null}
              {assets.map((asset) => (
                <AssetRow
                  asset={asset}
                  chains={data?.chains.map((chain) => chain.chainName) ?? []}
                  key={asset.assetId}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
        价格偏离仅使用流动性不少于 $10,000 的市场计算；尚未计入下单量造成的滑点、Gas、跨链费和跨链等待期间的波动。
      </p>
    </div>
  );
}

function AssetRow({ asset, chains }: { asset: SpotAssetPrice; chains: string[] }) {
  return (
    <tr className="align-top transition-colors hover:bg-muted/35">
      <td className="px-3 py-2.5">
        <div className="font-mono text-sm font-semibold">{asset.symbol}</div>
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
          <span className="text-[10px] text-muted-foreground">不足两条链</span>
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
    </tr>
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

function formatSignedPercent(value: number | null): string {
  if (value === null) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function changeTone(value: number | null): string {
  const tone = value === null ? 'text-muted-foreground' : value >= 0 ? 'text-emerald-700' : 'text-red-700';
  return `font-mono text-[9px] tabular-nums ${tone}`;
}
