import { ArrowLeftRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { CopyAddress } from '@/features/scanner/copy-address';
import { EmptyState, ErrorState, LoadingState } from '@/features/scanner/data-state';
import { ScanAction } from '@/features/scanner/scan-action';
import { useScanner } from '@/features/scanner/scanner-provider';
import { StatusBadge } from '@/features/scanner/status-badge';
import type { Asset, AssetStatus } from '@/features/scanner/types';
import { chainLabels, formatDateTime } from '@/lib/format';

interface CrosschainRoute {
  key: string;
  sourceChain: string;
  destinationChain: string;
}

export function AssetsPage() {
  const { assets, error, loading, refresh } = useScanner();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<AssetStatus | 'all'>('verified');

  const routeSummary = useMemo(() => {
    const usableAssets = (assets?.assets ?? []).filter((asset) => getActiveRoutes(asset).length > 0);
    const routes = usableAssets.flatMap(getActiveRoutes);
    const coveredChains = new Set(routes.flatMap((route) => [route.sourceChain, route.destinationChain]));
    return {
      assets: usableAssets.length,
      routes: routes.length,
      chains: coveredChains.size,
      deployments: usableAssets.reduce((total, asset) => total + asset.deployments.length, 0),
    };
  }, [assets?.assets]);

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (assets?.assets ?? [])
      .filter((asset) => {
        const matchesQuery =
          !normalizedQuery ||
          asset.symbol.toLowerCase().includes(normalizedQuery) ||
          asset.name.toLowerCase().includes(normalizedQuery) ||
          asset.deployments.some(
            (deployment) =>
              deployment.chainName.toLowerCase().includes(normalizedQuery) ||
              deployment.oftAddress.toLowerCase().includes(normalizedQuery) ||
              deployment.tokenAddress?.toLowerCase().includes(normalizedQuery),
          );
        return matchesQuery && (status === 'all' || asset.status === status);
      })
      .sort((left, right) => {
        const routeDifference = getActiveRoutes(right).length - getActiveRoutes(left).length;
        return routeDifference || left.symbol.localeCompare(right.symbol);
      });
  }, [assets?.assets, query, status]);

  if (loading)
    return (
      <PageShell>
        <LoadingState />
      </PageShell>
    );
  if (error && !assets)
    return (
      <PageShell>
        <ErrorState message={error} retry={refresh} />
      </PageShell>
    );

  const summary = assets?.summary;

  return (
    <PageShell>
      <div className="flex items-end justify-between gap-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">跨链资产</h1>
          <p className="mt-1 text-xs text-muted-foreground">查看已形成双向跨链路径、可进入价差扫描的资产。</p>
        </div>
        <ScanAction compact />
      </div>

      <dl className="mt-4 grid grid-cols-6 divide-x overflow-hidden rounded-lg border bg-card">
        <Metric label="可用跨链资产" tone="text-emerald-700" value={routeSummary.assets} />
        <Metric label="双向路径" tone="text-blue-700" value={routeSummary.routes} />
        <Metric label="覆盖链" value={routeSummary.chains} />
        <Metric label="路径内部署" value={routeSummary.deployments} />
        <Metric label="待补全路径" tone="text-amber-700" value={summary?.pendingAssets ?? 0} />
        <Metric label="已排除资产" tone="text-red-700" value={summary?.rejectedAssets ?? 0} />
      </dl>

      {!assets || assets.assets.length === 0 ? (
        <div className="mt-3">
          <EmptyState action={<ScanAction compact />} />
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2 rounded-lg border bg-card p-2">
            <label className="relative flex-1">
              <span className="sr-only">搜索跨链资产</span>
              <Search
                className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                className="h-9 w-full rounded-md border bg-background ps-8 pe-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/20"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索币种、链或合约地址"
                type="search"
                value={query}
              />
            </label>
            <label>
              <span className="sr-only">按路径状态筛选</span>
              <select
                className="h-9 min-w-40 rounded-md border bg-background px-2.5 text-xs outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
                onChange={(event) => setStatus(event.target.value as AssetStatus | 'all')}
                value={status}
              >
                <option value="verified">可用于价差扫描</option>
                <option value="pending">待补全路径</option>
                <option value="rejected">已排除</option>
                <option value="all">全部资产</option>
              </select>
            </label>
          </div>

          <section className="mt-3 overflow-hidden rounded-lg border bg-card" aria-labelledby="assets-table-title">
            <div className="flex h-10 items-center justify-between border-b px-3">
              <h2 className="text-sm font-semibold" id="assets-table-title">
                跨链路径清单
              </h2>
              <p className="font-mono text-[11px] text-muted-foreground">
                显示 {filteredAssets.length} / {assets.assets.length}
              </p>
            </div>
            {filteredAssets.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">没有符合当前筛选条件的资产。</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] border-collapse text-left text-xs">
                  <thead className="bg-muted/60 text-[10px] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium" scope="col">
                        资产
                      </th>
                      <th className="px-3 py-2 font-medium" scope="col">
                        可用跨链路径
                      </th>
                      <th className="px-3 py-2 font-medium" scope="col">
                        链上部署与地址
                      </th>
                      <th className="px-3 py-2 font-medium" scope="col">
                        跨链模式
                      </th>
                      <th className="px-3 py-2 font-medium" scope="col">
                        最近验证
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredAssets.map((asset) => {
                      const routes = getActiveRoutes(asset);
                      return (
                        <tr className="align-top transition-colors hover:bg-muted/35" key={asset.id}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-semibold">{asset.symbol}</span>
                              <StatusBadge className="px-1.5 text-[10px]" value={asset.status} />
                            </div>
                            <p
                              className="mt-0.5 max-w-48 truncate text-[11px] text-muted-foreground"
                              title={asset.name}
                            >
                              {asset.name}
                            </p>
                          </td>
                          <td className="px-3 py-2.5">
                            {routes.length > 0 ? (
                              <div className="flex max-w-md flex-wrap gap-1.5">
                                {routes.map((route) => (
                                  <span
                                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-medium text-emerald-800"
                                    key={route.key}
                                  >
                                    {chainLabel(route.sourceChain)}
                                    <ArrowLeftRight className="size-3" aria-label="双向" />
                                    {chainLabel(route.destinationChain)}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <PathUnavailable asset={asset} />
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="space-y-1.5">
                              {asset.deployments.map((deployment) => {
                                const tokenAddress = deployment.tokenAddress ?? deployment.oftAddress;
                                const hasSeparateBridge =
                                  tokenAddress.toLowerCase() !== deployment.oftAddress.toLowerCase();
                                return (
                                  <div
                                    className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-1"
                                    key={deployment.id}
                                  >
                                    <span className="pt-1 font-medium">{chainLabel(deployment.chainName)}</span>
                                    <div className="flex flex-wrap gap-x-1">
                                      <CopyAddress
                                        address={tokenAddress}
                                        label={hasSeparateBridge ? 'Token' : 'Token/OFT'}
                                      />
                                      {hasSeparateBridge ? (
                                        <CopyAddress address={deployment.oftAddress} label="Adapter" />
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <StatusBadge className="px-1.5 text-[10px]" value={asset.crosschainType} />
                            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                              {asset.deployments.length} 条链上部署
                            </p>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[10px] text-muted-foreground">
                            {formatDateTime(asset.lastVerifiedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </PageShell>
  );
}

function getActiveRoutes(asset: Asset): CrosschainRoute[] {
  const deploymentByEndpoint = new Map(
    asset.deployments.flatMap((deployment) =>
      deployment.endpointId === null ? [] : [[deployment.endpointId, deployment] as const],
    ),
  );
  const routes = new Map<string, CrosschainRoute>();

  for (const source of asset.deployments) {
    for (const peer of source.peers) {
      const destination = deploymentByEndpoint.get(peer.endpointId);
      if (peer.status !== 'active' || !destination || destination.id === source.id) continue;
      const chains = [source.chainName, destination.chainName].sort();
      const key = chains.join(':');
      routes.set(key, { key, sourceChain: chains[0], destinationChain: chains[1] });
    }
  }

  return [...routes.values()];
}

function PathUnavailable({ asset }: { asset: Asset }) {
  const verifiedDeployments = asset.deployments.filter((deployment) => deployment.scanStatus === 'verified').length;
  const oneWayPeers = asset.deployments.reduce(
    (total, deployment) => total + deployment.peers.filter((peer) => peer.status === 'one_way').length,
    0,
  );
  const reason =
    verifiedDeployments < 2
      ? `仅发现 ${verifiedDeployments} 条有效部署`
      : oneWayPeers > 0
        ? `${oneWayPeers} 条单向配置，尚未双向连通`
        : '尚未发现双向跨链路径';

  return <span className="text-[11px] text-muted-foreground">{reason}</span>;
}

function chainLabel(chainName: string) {
  return chainLabels[chainName] ?? chainName;
}

function Metric({ label, tone, value }: { label: string; tone?: string; value: number }) {
  return (
    <div className="px-3 py-2.5">
      <dt className="whitespace-nowrap text-[10px] text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 font-mono text-lg font-semibold tabular-nums ${tone ?? ''}`}>{value}</dd>
    </div>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[110rem] px-5 py-4">{children}</div>;
}
