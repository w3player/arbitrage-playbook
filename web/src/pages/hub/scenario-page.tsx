import { ArrowLeft, ArrowRight, Construction, Orbit } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router';

import { findScenario } from '@/app/scenarios';

export function ScenarioPage() {
  const { scenarioId } = useParams();
  const scenario = findScenario(scenarioId);
  if (!scenario) return <Navigate replace to="/" />;
  if (scenario.status === 'available') return <Navigate replace to={scenario.route} />;

  const Icon = scenario.icon;
  return (
    <div className="min-h-dvh min-w-[1100px] bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link
            className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
            to="/"
          >
            <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <Orbit className="size-4" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold">Arbitrage Playbook</span>
          </Link>
          <span className="rounded-full border bg-muted px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
            SCENARIO PREVIEW
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Link
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
          to="/"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          返回场景首页
        </Link>
        <section className="mt-6 grid grid-cols-[1fr_22rem] gap-8">
          <div>
            <span className="grid size-11 place-items-center rounded-lg border bg-card text-primary shadow-sm">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
              {scenario.scope}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{scenario.name}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{scenario.description}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Construction className="size-4 text-amber-600" aria-hidden="true" />
              场景尚未接入
            </div>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              路由和页面边界已经预留。后续接入时会独立配置数据源、风险阈值、执行账户和 API 命名空间。
            </p>
          </div>
        </section>
        <section className="mt-8 overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-xs font-semibold">计划工作流</div>
          <ol className="grid grid-cols-4 divide-x">
            {scenario.stages.map((stage, index) => (
              <li className="px-4 py-4" key={stage}>
                <span className="font-mono text-[9px] font-semibold text-muted-foreground">P{index + 1}</span>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs font-medium">
                  {stage}
                  {index < scenario.stages.length - 1 ? (
                    <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
