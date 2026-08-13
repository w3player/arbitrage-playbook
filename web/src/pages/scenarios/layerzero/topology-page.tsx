import { ArrowRight, CheckCircle2, Network, Route, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { ErrorState, LoadingState } from '@/features/scanner/data-state';
import { useScanner } from '@/features/scanner/scanner-provider';
import { StatusBadge } from '@/features/scanner/status-badge';
import { chainLabels } from '@/lib/format';

export function TopologyPage() {
  const { assets, error, loading, refresh } = useScanner();
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

  const rows = (assets?.assets ?? [])
    .filter(
      (asset) => asset.deployments.length > 1 || asset.deployments.some((deployment) => deployment.peers.length > 0),
    )
    .slice(0, 20);
  const multiChain = (assets?.assets ?? []).filter(
    (asset) => new Set(asset.deployments.map((item) => item.chainName)).size > 1,
  ).length;
  const peerRecords = (assets?.assets ?? []).reduce(
    (sum, asset) => sum + asset.deployments.reduce((total, item) => total + item.peers.length, 0),
    0,
  );
  const activePeers = assets?.summary.activePeerPaths ?? 0;

  return (
    <PageShell>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            TOPOLOGY & SECURITY · P2
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">拓扑与安全</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            监控多链部署、peer 证据和双向关系。当前展示扫描器已读取的事实，尚未通过反向 peer 验证的路径不会计为活跃。
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg border px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          to="/layerzero/assets"
        >
          返回资产目录 <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <section className="mt-7 grid gap-4 sm:grid-cols-3" aria-label="拓扑概览">
        <Metric icon={Network} label="多链候选" value={multiChain} detail="至少两个链部署" />
        <Metric icon={Route} label="Peer 记录" value={peerRecords} detail="链上读取到的非零 peer" />
        <Metric icon={CheckCircle2} label="双向活跃路径" value={activePeers} detail="完成反向验证后计入" />
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border bg-card" aria-labelledby="topology-table-title">
        <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2 className="font-semibold" id="topology-table-title">
              拓扑验证队列
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">优先显示多链部署或已发现 peer 的资产</p>
          </div>
          <span className="font-mono text-xs text-muted-foreground">{rows.length} shown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">资产</th>
                <th className="px-4 py-3 font-medium">部署链</th>
                <th className="px-4 py-3 font-medium">Peer 证据</th>
                <th className="px-4 py-3 font-medium">可信度</th>
                <th className="px-5 py-3 font-medium">准入状态</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((asset) => {
                const peers = asset.deployments.reduce((total, item) => total + item.peers.length, 0);
                const chains = [...new Set(asset.deployments.map((item) => item.chainName))];
                const eligible =
                  asset.status === 'verified' && asset.trustGrade !== 'C' && asset.trustGrade !== 'D' && peers > 0;
                return (
                  <tr className="align-top transition-colors hover:bg-muted/35" key={asset.id}>
                    <td className="px-5 py-4">
                      <span className="font-mono font-semibold">{asset.symbol}</span>
                      <p className="mt-1 text-xs text-muted-foreground">{asset.name}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {chains.map((chain) => (
                          <span className="rounded-md bg-muted px-2 py-1 text-xs" key={chain}>
                            {chainLabels[chain] ?? chain}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono font-semibold tabular-nums">{peers}</td>
                    <td className="px-4 py-4">
                      <span className="inline-grid size-7 place-items-center rounded-full border bg-muted font-mono text-xs font-bold">
                        {asset.trustGrade}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {eligible ? (
                        <StatusBadge value="verified" />
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-amber-700">
                          <ShieldAlert className="size-3.5" />
                          待补全证据
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </PageShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Network;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="mt-4 font-mono text-3xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[100rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>;
}
