import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { EmptyState, ErrorState, LoadingState } from '@/features/scanner/data-state';
import { ScanAction } from '@/features/scanner/scan-action';
import { useScanner } from '@/features/scanner/scanner-provider';
import { StatusBadge } from '@/features/scanner/status-badge';
import type { AssetStatus } from '@/features/scanner/types';
import { chainLabels, formatDateTime, shortAddress } from '@/lib/format';

export function AssetsPage() {
  const { assets, error, loading, refresh } = useScanner();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<AssetStatus | 'all'>('all');

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (assets?.assets ?? []).filter((asset) => {
      const matchesQuery =
        !normalizedQuery ||
        asset.symbol.toLowerCase().includes(normalizedQuery) ||
        asset.name.toLowerCase().includes(normalizedQuery) ||
        asset.deployments.some((deployment) => deployment.oftAddress.toLowerCase().includes(normalizedQuery));
      return matchesQuery && (status === 'all' || asset.status === status);
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

  return (
    <PageShell>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-primary">Verified universe</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">跨链资产池</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            查看 OFT 部署、链路状态与合约地址，为后续价格扫描选择资产。
          </p>
        </div>
        <ScanAction compact />
      </div>

      {!assets || assets.assets.length === 0 ? (
        <div className="mt-7">
          <EmptyState action={<ScanAction compact />} />
        </div>
      ) : (
        <>
          <div className="mt-7 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">搜索资产</span>
              <Search
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                className="h-11 w-full rounded-lg border bg-background ps-10 pe-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/20"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索 Symbol、名称或合约地址"
                type="search"
                value={query}
              />
            </label>
            <label>
              <span className="sr-only">按状态筛选</span>
              <select
                className="h-11 min-w-40 rounded-lg border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
                onChange={(event) => setStatus(event.target.value as AssetStatus | 'all')}
                value={status}
              >
                <option value="all">全部状态</option>
                <option value="verified">已验证</option>
                <option value="pending">待验证</option>
                <option value="rejected">已拒绝</option>
              </select>
            </label>
          </div>

          <section className="mt-4 overflow-hidden rounded-xl border bg-card" aria-labelledby="assets-table-title">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="font-semibold" id="assets-table-title">
                资产清单
              </h2>
              <p className="font-mono text-xs text-muted-foreground">
                {filteredAssets.length} / {assets.assets.length}
              </p>
            </div>
            {filteredAssets.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">没有符合当前筛选条件的资产。</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 font-medium" scope="col">
                        资产
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        可信度
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        类型
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        部署与状态
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        活跃 Peer
                      </th>
                      <th className="px-5 py-3 font-medium" scope="col">
                        最近验证
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredAssets.map((asset) => {
                      const activePeers = asset.deployments.reduce(
                        (total, deployment) =>
                          total + deployment.peers.filter((peer) => peer.status === 'active').length,
                        0,
                      );
                      return (
                        <tr className="align-top transition-colors hover:bg-muted/35" key={asset.id}>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold">{asset.symbol}</span>
                              <StatusBadge value={asset.status} />
                            </div>
                            <p className="mt-1 max-w-52 truncate text-xs text-muted-foreground" title={asset.name}>
                              {asset.name}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            <span className="inline-grid size-7 place-items-center rounded-full border bg-muted font-mono text-xs font-bold">
                              {asset.trustGrade}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <StatusBadge value={asset.crosschainType} />
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-2">
                              {asset.deployments.map((deployment) => (
                                <div className="flex items-center gap-2" key={deployment.id}>
                                  <span className="w-20 font-medium">
                                    {chainLabels[deployment.chainName] ?? deployment.chainName}
                                  </span>
                                  <StatusBadge value={deployment.scanStatus} />
                                  <code
                                    className="font-mono text-xs text-muted-foreground"
                                    title={deployment.oftAddress}
                                  >
                                    {shortAddress(deployment.oftAddress)}
                                  </code>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-4 font-mono font-semibold tabular-nums">{activePeers}</td>
                          <td className="px-5 py-4 font-mono text-xs text-muted-foreground">
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

function PageShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>;
}
