import { ArrowRight, BookOpen, Orbit, Radio, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';

import { arbitrageScenarios } from '@/app/scenarios';
import type { ArbitrageScenario, ScenarioStatus } from '@/app/scenarios';

const statusLabels: Record<ScenarioStatus, string> = {
  available: '可用',
  designing: '设计中',
  planned: '规划中',
};

export function HomePage() {
  const availableCount = arbitrageScenarios.filter((scenario) => scenario.status === 'available').length;

  return (
    <div className="min-h-dvh min-w-[1100px] bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-[110rem] items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm">
              <Orbit className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">Arbitrage Playbook</p>
              <p className="text-[9px] text-muted-foreground">Research · Monitor · Execute</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Radio className="size-3.5 text-emerald-600" aria-hidden="true" />
              {availableCount} 个场景已接入
            </span>
            <span className="rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold">LOCAL WORKSPACE</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[110rem] px-6 py-8">
        <section className="grid grid-cols-[minmax(0,1.45fr)_minmax(24rem,0.55fr)] gap-6 border-b pb-8">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              Arbitrage Operations Hub
            </p>
            <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight">从统一入口进入不同套利实践</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              每个场景拥有独立的数据源、机会模型和执行约束。首页只负责分流，进入场景后再加载对应监控与后端服务。
            </p>
          </div>
          <dl className="grid grid-cols-2 divide-x overflow-hidden rounded-lg border bg-card">
            <SummaryMetric label="套利场景" value={arbitrageScenarios.length} />
            <SummaryMetric label="已接入" tone="text-emerald-700" value={availableCount} />
          </dl>
        </section>

        <section className="mt-7" aria-labelledby="scenario-title">
          <div className="flex items-end justify-between gap-5">
            <div>
              <h2 className="text-base font-semibold" id="scenario-title">
                选择场景
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                场景注册表可持续扩展，不把不同套利模型混进同一套导航。
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              执行能力按场景隔离
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-3">
            {arbitrageScenarios.map((scenario) => (
              <ScenarioCard key={scenario.id} scenario={scenario} />
            ))}
          </div>
        </section>

        <section className="mt-7 rounded-lg border bg-card px-4 py-3" aria-labelledby="workflow-title">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground">
                <BookOpen className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-xs font-semibold" id="workflow-title">
                  统一工作流
                </h2>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  发现资产或市场 → 扫描候选 → 验证可执行性 → 提交与跟踪
                </p>
              </div>
            </div>
            <p className="max-w-xl text-right text-[10px] leading-4 text-muted-foreground">
              共享前端只统一交互与观测口径；价格源、风险模型、钱包权限和执行合约仍由各场景独立维护。
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: ArbitrageScenario }) {
  const Icon = scenario.icon;
  return (
    <Link
      className="group flex min-h-56 flex-col rounded-lg border bg-card p-4 outline-none transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/40"
      to={scenario.route}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-9 place-items-center rounded-md border bg-muted text-foreground transition-colors group-hover:border-primary/30 group-hover:bg-primary/5 group-hover:text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <StatusLabel status={scenario.status} />
      </div>
      <div className="mt-4">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          {scenario.scope}
        </p>
        <h3 className="mt-1.5 text-sm font-semibold">{scenario.name}</h3>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{scenario.description}</p>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div className="flex max-w-52 flex-wrap gap-1">
          {scenario.stages.slice(0, 3).map((stage) => (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground" key={stage}>
              {stage}
            </span>
          ))}
        </div>
        <ArrowRight
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}

function StatusLabel({ status }: { status: ScenarioStatus }) {
  const tone =
    status === 'available'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : status === 'designing'
        ? 'border-blue-200 bg-blue-50 text-blue-800'
        : 'border-slate-200 bg-slate-50 text-slate-700';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${tone}`}>{statusLabels[status]}</span>
  );
}

function SummaryMetric({ label, tone, value }: { label: string; tone?: string; value: number }) {
  return (
    <div className="flex flex-col justify-center px-5 py-4">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</dd>
    </div>
  );
}
