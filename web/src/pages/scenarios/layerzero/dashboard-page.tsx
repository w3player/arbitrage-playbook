import { Activity, BadgeCheck, Boxes, LockKeyhole, Route as RouteIcon, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { EmptyState, ErrorState, LoadingState } from '@/features/scanner/data-state';
import { ScanAction } from '@/features/scanner/scan-action';
import { useScanner } from '@/features/scanner/scanner-provider';
import { StatusBadge } from '@/features/scanner/status-badge';
import { chainLabels, formatDateTime } from '@/lib/format';

export function DashboardPage() {
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

  const summary = assets?.summary;
  const recentAssets = assets?.assets.slice(0, 6) ?? [];

  return (
    <PageShell>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Operations overview
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">跨链套利指挥中心</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            监控从资产发现、链上验证、市场分析到受限执行的完整链路。当前处于 P1 只读资产扫描阶段。
          </p>
        </div>
        <div className="sm:hidden">
          <ScanAction compact />
        </div>
      </div>

      {error ? (
        <p
          className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          数据刷新失败，当前展示上一次成功结果。
        </p>
      ) : null}

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="资产扫描指标">
        <MetricCard
          icon={Boxes}
          label="已发现资产"
          value={summary?.totalAssets ?? 0}
          detail={`${summary?.totalDeployments ?? 0} 个链上部署`}
        />
        <MetricCard
          icon={BadgeCheck}
          label="可信资产"
          value={summary?.verifiedAssets ?? 0}
          detail={`${summary?.verifiedDeployments ?? 0} 个部署已验证`}
          tone="success"
        />
        <MetricCard
          icon={RouteIcon}
          label="活跃 Peer 路径"
          value={summary?.activePeerPaths ?? 0}
          detail="双向配置可用"
          tone="primary"
        />
        <MetricCard
          icon={TriangleAlert}
          label="失败部署"
          value={summary?.failedDeployments ?? 0}
          detail={`${summary?.pendingAssets ?? 0} 个资产待确认`}
          tone={summary?.failedDeployments ? 'danger' : 'neutral'}
        />
      </section>

      {!assets || assets.assets.length === 0 ? (
        <div className="mt-7">
          <EmptyState action={<ScanAction compact />} />
        </div>
      ) : (
        <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="recent-assets-title">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h2 className="font-semibold" id="recent-assets-title">
                  最近更新的资产
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">按数据库更新时间排序</p>
              </div>
              <Link
                className="rounded-md px-3 py-2 text-sm font-medium text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                to="/layerzero/assets"
              >
                查看全部
              </Link>
            </div>
            <div className="divide-y">
              {recentAssets.map((asset) => (
                <article
                  className="grid gap-4 px-5 py-4 transition-colors hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                  key={asset.id}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{asset.symbol}</span>
                      <StatusBadge value={asset.status} />
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{asset.name}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5" aria-label={`${asset.symbol} 部署链`}>
                    {asset.deployments.map((deployment) => (
                      <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium" key={deployment.id}>
                        {chainLabels[deployment.chainName] ?? deployment.chainName}
                      </span>
                    ))}
                  </div>
                  <time className="font-mono text-xs text-muted-foreground" dateTime={asset.updatedAt}>
                    {formatDateTime(asset.updatedAt)}
                  </time>
                </article>
              ))}
            </div>
          </section>

          <div className="grid content-start gap-6">
            <ScanAction />
            <section className="rounded-xl border bg-card p-5" aria-labelledby="pipeline-title">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-primary" aria-hidden="true" />
                <h2 className="font-semibold" id="pipeline-title">
                  系统流水线
                </h2>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">严格按 plan.md 的数据门槛逐层开放。</p>
              <ol className="mt-5 space-y-2 text-sm">
                <PipelineStep label="资产发现" stage="P1" state="active" to="/layerzero/assets" />
                <PipelineStep label="链上验证" stage="P2" state="next" to="/layerzero/assets" />
                <PipelineStep label="市场数据" stage="P3" state="locked" to="/layerzero/market-prices" />
                <PipelineStep label="机会决策" stage="P3" state="locked" to="/layerzero/prices" />
                <PipelineStep label="库存与执行" stage="P4+" state="locked" to="/layerzero/execution" />
                <PipelineStep label="风控与审计" stage="全程" state="guarded" to="/layerzero/execution" />
              </ol>
            </section>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>;
}

interface MetricCardProps {
  icon: typeof Boxes;
  label: string;
  value: number;
  detail: string;
  tone?: 'neutral' | 'primary' | 'success' | 'danger';
}

function MetricCard({ icon: Icon, label, value, detail, tone = 'neutral' }: MetricCardProps) {
  const toneClass = {
    neutral: 'bg-slate-100 text-slate-700',
    primary: 'bg-blue-100 text-blue-700',
    success: 'bg-emerald-100 text-emerald-700',
    danger: 'bg-red-100 text-red-700',
  }[tone];
  return (
    <article className="rounded-xl border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className={`grid size-9 place-items-center rounded-lg ${toneClass}`}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 font-mono text-3xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}

function PipelineStep({
  label,
  stage,
  state,
  to,
}: {
  label: string;
  stage: string;
  state: 'active' | 'next' | 'locked' | 'guarded';
  to: string;
}) {
  const status = {
    active: '当前',
    next: '待验证',
    locked: '未开放',
    guarded: '安全模式',
  }[state];
  return (
    <li>
      <Link
        className="flex min-h-10 items-center gap-3 rounded-lg px-2 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        to={to}
      >
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-md border font-mono text-[9px] font-semibold ${state === 'active' ? 'border-blue-200 bg-blue-50 text-blue-700' : state === 'guarded' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-border bg-muted text-muted-foreground'}`}
        >
          {state === 'locked' ? <LockKeyhole className="size-3" aria-hidden="true" /> : stage}
        </span>
        <span className={state === 'active' || state === 'guarded' ? 'font-medium' : 'text-muted-foreground'}>
          {label}
        </span>
        <span className="ms-auto text-[11px] text-muted-foreground">{status}</span>
      </Link>
    </li>
  );
}
