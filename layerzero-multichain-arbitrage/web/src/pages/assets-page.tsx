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
        asset.sourceKey.toLowerCase().includes(normalizedQuery) ||
        asset.deployments.some(
          (deployment) =>
            deployment.oftAddress.toLowerCase().includes(normalizedQuery) ||
            deployment.tokenAddress?.toLowerCase().includes(normalizedQuery),
        );
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

  const summary = assets?.summary;

  return (
    <PageShell>
      <div className="flex items-end justify-between gap-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">资产管理</h1>
          <p className="mt-1 text-xs text-muted-foreground">LayerZero 资产发现、合约验证与双向 Peer 检查。</p>
        </div>
        <ScanAction compact />
      </div>

      <dl className="mt-4 grid grid-cols-8 divide-x overflow-hidden rounded-lg border bg-card">
        <Metric label="资产总数" value={summary?.totalAssets ?? 0} />
        <Metric label="已验证" tone="text-emerald-700" value={summary?.verifiedAssets ?? 0} />
        <Metric label="待验证" tone="text-amber-700" value={summary?.pendingAssets ?? 0} />
        <Metric label="已拒绝" tone="text-red-700" value={summary?.rejectedAssets ?? 0} />
        <Metric label="部署总数" value={summary?.totalDeployments ?? 0} />
        <Metric label="验证部署" tone="text-emerald-700" value={summary?.verifiedDeployments ?? 0} />
        <Metric label="失败部署" tone="text-red-700" value={summary?.failedDeployments ?? 0} />
        <Metric label="活跃路径" tone="text-blue-700" value={summary?.activePeerPaths ?? 0} />
      </dl>

      {!assets || assets.assets.length === 0 ? (
        <div className="mt-3">
          <EmptyState action={<ScanAction compact />} />
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2 rounded-lg border bg-card p-2">
            <label className="relative flex-1">
              <span className="sr-only">搜索资产</span>
              <Search
                className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                className="h-9 w-full rounded-md border bg-background ps-8 pe-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/20"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索 Symbol、名称、Source Key、OFT 或 Token 地址"
                type="search"
                value={query}
              />
            </label>
            <label>
              <span className="sr-only">按状态筛选</span>
              <select
                className="h-9 min-w-32 rounded-md border bg-background px-2.5 text-xs outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
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

          <section className="mt-3 overflow-hidden rounded-lg border bg-card" aria-labelledby="assets-table-title">
            <div className="flex h-10 items-center justify-between border-b px-3">
              <h2 className="text-sm font-semibold" id="assets-table-title">
                资产清单
              </h2>
              <p className="font-mono text-[11px] text-muted-foreground">
                显示 {filteredAssets.length} / {assets.assets.length}
              </p>
            </div>
            {filteredAssets.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">没有符合当前筛选条件的资产。</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1360px] border-collapse text-left text-xs">
                  <thead className="bg-muted/60 text-[10px] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium" scope="col">
                        资产
                      </th>
                      <th className="px-3 py-2 font-medium" scope="col">
                        状态 / 等级
                      </th>
                      <th className="px-3 py-2 font-medium" scope="col">
                        类型
                      </th>
                      <th className="px-3 py-2 font-medium" scope="col">
                        部署
                      </th>
                      <th className="px-3 py-2 font-medium" scope="col">
                        合约地址
                      </th>
                      <th className="px-3 py-2 font-medium" scope="col">
                        Peer
                      </th>
                      <th className="px-3 py-2 font-medium" scope="col">
                        合约配置
                      </th>
                      <th className="px-3 py-2 font-medium" scope="col">
                        扫描区块
                      </th>
                      <th className="px-3 py-2 font-medium" scope="col">
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
                      const totalPeers = asset.deployments.reduce(
                        (total, deployment) => total + deployment.peers.length,
                        0,
                      );
                      const oneWayPeers = asset.deployments.reduce(
                        (total, deployment) =>
                          total + deployment.peers.filter((peer) => peer.status === 'one_way').length,
                        0,
                      );

                      return (
                        <tr className="align-top transition-colors hover:bg-muted/35" key={asset.id}>
                          <td className="px-3 py-2.5">
                            <p className="font-mono text-sm font-semibold">{asset.symbol}</p>
                            <p
                              className="mt-0.5 max-w-44 truncate text-[11px] text-muted-foreground"
                              title={asset.name}
                            >
                              {asset.name}
                            </p>
                            <p
                              className="mt-1 max-w-44 truncate font-mono text-[9px] text-muted-foreground/80"
                              title={asset.sourceKey}
                            >
                              {asset.sourceKey}
                            </p>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <StatusBadge className="px-1.5 text-[10px]" value={asset.status} />
                              <span className="inline-grid size-5 place-items-center rounded-full border bg-muted font-mono text-[10px] font-bold">
                                {asset.trustGrade}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <StatusBadge className="px-1.5 text-[10px]" value={asset.crosschainType} />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="space-y-1.5">
                              {asset.deployments.map((deployment) => (
                                <div className="whitespace-nowrap" key={deployment.id}>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium">
                                      {chainLabels[deployment.chainName] ?? deployment.chainName}
                                    </span>
                                    <StatusBadge className="px-1.5 text-[9px]" value={deployment.scanStatus} />
                                  </div>
                                  <p className="font-mono text-[9px] text-muted-foreground">
                                    CID {deployment.chainId ?? '—'} · EID {deployment.endpointId ?? '—'}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="space-y-1.5 font-mono text-[10px]">
                              {asset.deployments.map((deployment) => (
                                <div key={deployment.id}>
                                  <p title={deployment.oftAddress}>OFT {shortAddress(deployment.oftAddress)}</p>
                                  <p className="text-muted-foreground" title={deployment.tokenAddress ?? undefined}>
                                    Token {deployment.tokenAddress ? shortAddress(deployment.tokenAddress) : '—'}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums">
                            <p className="font-semibold text-emerald-700">
                              {activePeers} / {totalPeers} active
                            </p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">{oneWayPeers} one-way</p>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="space-y-1.5 text-[10px]">
                              {asset.deployments.map((deployment) => (
                                <div key={deployment.id}>
                                  <p>授权 {formatFlag(deployment.approvalRequired)}</p>
                                  <p className="text-muted-foreground">暂停 {formatFlag(deployment.paused)}</p>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="space-y-1.5 font-mono text-[10px] tabular-nums">
                              {asset.deployments.map((deployment) => (
                                <div key={deployment.id}>
                                  <p>{deployment.lastScannedBlock ?? '—'}</p>
                                  <p className="text-muted-foreground">{formatDateTime(deployment.lastScannedAt)}</p>
                                </div>
                              ))}
                            </div>
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

function Metric({ label, tone, value }: { label: string; tone?: string; value: number }) {
  return (
    <div className="px-3 py-2.5">
      <dt className="whitespace-nowrap text-[10px] text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 font-mono text-lg font-semibold tabular-nums ${tone ?? ''}`}>{value}</dd>
    </div>
  );
}

function formatFlag(value: boolean | null) {
  if (value === null) return '未知';
  return value ? '是' : '否';
}

function PageShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[110rem] px-5 py-4">{children}</div>;
}
