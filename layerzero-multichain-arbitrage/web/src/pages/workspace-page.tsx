import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  CircleDashed,
  Database,
  KeyRound,
  LockKeyhole,
  RadioTower,
  ShieldCheck,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { useScanner } from '@/features/scanner/scanner-provider';
import { formatDateTime } from '@/lib/format';

type WorkspaceKey =
  | 'markets'
  | 'opportunities'
  | 'backtests'
  | 'inventory'
  | 'executions'
  | 'risk'
  | 'incidents'
  | 'audit';

interface WorkspaceConfig {
  eyebrow: string;
  title: string;
  description: string;
  stage: string;
  state: 'planned' | 'guarded' | 'monitoring';
  gate: string;
  outputs: string[];
  checks: string[];
  nextRoute: string;
  nextLabel: string;
}

const workspaces: Record<WorkspaceKey, WorkspaceConfig> = {
  markets: {
    eyebrow: 'MARKET DATA · P3',
    title: '行情与报价源',
    description: '采集三条链上的可执行 DEX 报价、Gas、桥费和流动性，为相同数量资产建立统一价格基准。',
    stage: 'P3 · 未接入',
    state: 'planned',
    gate: '只有资产拓扑、安全配置和双向 peer 通过 P2 验证后，才允许进入价格采集。',
    outputs: ['多金额档位的可执行报价', '报价区块、延迟与陈旧率', 'Gas、滑点与跨链补库存成本'],
    checks: ['DEX / Router 白名单待确定', '报价采集频率待确定', '稳定币与脱锚策略待确定'],
    nextRoute: '/opportunities',
    nextLabel: '查看机会决策层',
  },
  opportunities: {
    eyebrow: 'OPPORTUNITY ENGINE · P3',
    title: '套利机会',
    description: '比较同一资产、相同数量在不同链上的真实可成交价格，只展示扣除全部成本后的保守净价差。',
    stage: 'P3 · 未接入',
    state: 'planned',
    gate: '报价必须可执行、时间差合格、成本完整，并通过库存、安全与风险准入检查。',
    outputs: ['双方向毛价差与保守净利', '利润—规模曲线与容量', '拒绝原因、置信度与策略版本'],
    checks: ['不使用页面展示价格', '不把桥接延迟当作原子交易', '不展示虚构机会或收益'],
    nextRoute: '/backtests',
    nextLabel: '查看历史回放门槛',
  },
  backtests: {
    eyebrow: 'REPLAY & PAPER TRADING · P4',
    title: '历史回放',
    description: '使用当时可见的真实报价重放策略，评估库存耗尽、单边成交、补库存成本和相对持有基准。',
    stage: 'P4 · 未接入',
    state: 'planned',
    gate: '必须先持续保存可还原的原始报价，禁止在历史决策中使用未来区块状态。',
    outputs: ['纸面交易与库存状态机', '压力场景与单边失败模型', '净收益、资金利用率与持有基准'],
    checks: ['至少两周连续采集', '原始 quote 与 calldata 可追溯', '策略版本和配置版本可重放'],
    nextRoute: '/inventory',
    nextLabel: '查看库存管理设计',
  },
  inventory: {
    eyebrow: 'CAPITAL & REBALANCE · P4',
    title: '库存与调仓',
    description: '按链、资产和资金状态管理可用、预留、在途与安全库存，跨链只承担事后补库存职责。',
    stage: 'P4 · 未接入',
    state: 'planned',
    gate: '资金只能处于一个状态；在途资产不能计入可用余额，硬阈值触发后停止消耗方向。',
    outputs: ['每链资产与 Gas 安全余额', '软 / 硬库存阈值', '补库存报价、GUID 与到账核账'],
    checks: ['第一版不接入私钥', '不重复占用同一库存', '超时进入恢复流程而非重复发送'],
    nextRoute: '/executions',
    nextLabel: '查看执行阶段',
  },
  executions: {
    eyebrow: 'EXECUTION CONTROL · P5—P8',
    title: '执行中心',
    description: '链下协调器与受限执行合约共同完成模拟、预留、并发提交、回执核账和失败恢复。',
    stage: 'E0 · 执行关闭',
    state: 'guarded',
    gate: '当前保持只读。只有历史回放、失败恢复、测试网、安全审查和影子运行逐级验收后才能接入资金。',
    outputs: ['待签交易与静态模拟', '双成 / 单成 / 双败状态机', '链上回执、实际净利与恢复任务'],
    checks: ['签名器未接入', '广播能力关闭', '自动交易与跨链 Compose 禁用'],
    nextRoute: '/risk',
    nextLabel: '查看风险门槛',
  },
  risk: {
    eyebrow: 'RISK CONTROL',
    title: '风险控制',
    description: '集中展示执行阶段、资金权限和自动熔断边界。未满足门槛时系统只能查询、对账和生成模拟。',
    stage: '安全模式 · READ ONLY',
    state: 'guarded',
    gate: '当前没有接入私钥、签名器或执行合约，实时风险指标将在库存与执行数据模型完成后启用。',
    outputs: ['单笔、单资产、单链与日亏损限额', '配置漂移与余额对账熔断', '独立暂停、恢复与事故流程'],
    checks: ['真实资金：未接入', '自动执行：关闭', '允许的资产类型：Direct OFT / OFTAdapter'],
    nextRoute: '/incidents',
    nextLabel: '查看变更与告警',
  },
  incidents: {
    eyebrow: 'ALERTS & INCIDENTS · P2+',
    title: '变更与告警',
    description: '聚合 peer、owner、实现、DVN、暂停状态、报价源和跨链交付异常，并按 P0—P3 处理。',
    stage: 'P2 · 基础监控',
    state: 'monitoring',
    gate: '当前只能显示扫描服务与部署失败状态；配置版本、消息交付和余额告警尚未接入。',
    outputs: ['P0—P3 告警队列', '配置漂移与冻结原因', '处理过程、恢复状态与复盘'],
    checks: ['P0：疑似资产损失', 'P1：单边成交 / 跨链超时', 'P2：数据源 / 库存 / 模拟异常'],
    nextRoute: '/audit',
    nextLabel: '查看审计边界',
  },
  audit: {
    eyebrow: 'AUDIT TRAIL',
    title: '审计记录',
    description: '保存从候选来源、RPC 证据、报价决策、配置版本到链上回执的完整可追溯链路。',
    stage: '数据模型 · 规划中',
    state: 'planned',
    gate: '当前资产与部署已有持久化记录；原始报价、机会、执行、配置版本和事故数据集待后续阶段建立。',
    outputs: ['不可变决策与执行记录', '原始请求、响应与链上证据', '日报、周报与版本对照报告'],
    checks: ['金额使用整数最小单位', '时间统一 UTC', '日志禁止包含密钥、签名或 RPC 凭证'],
    nextRoute: '/',
    nextLabel: '返回指挥中心',
  },
};

export function WorkspacePage({ workspace }: { workspace: WorkspaceKey }) {
  const config = workspaces[workspace];
  const { assets, scanStatus } = useScanner();
  const stateStyle = {
    planned: 'border-slate-200 bg-slate-50 text-slate-700',
    guarded: 'border-amber-200 bg-amber-50 text-amber-800',
    monitoring: 'border-blue-200 bg-blue-50 text-blue-800',
  }[config.state];

  return (
    <PageShell>
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-primary">{config.eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{config.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{config.description}</p>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${stateStyle}`}
        >
          {config.state === 'guarded' ? <LockKeyhole className="size-3.5" /> : <CircleDashed className="size-3.5" />}
          {config.stage}
        </span>
      </div>

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="当前系统边界">
        <SignalCard icon={RadioTower} label="扫描服务" value={scanStatus?.state === 'running' ? '运行中' : '空闲'} />
        <SignalCard icon={Database} label="资产记录" value={(assets?.summary.totalAssets ?? 0).toLocaleString()} />
        <SignalCard icon={KeyRound} label="签名器" value="未接入" tone="safe" />
        <SignalCard icon={Ban} label="自动执行" value="关闭" tone="safe" />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-5 sm:p-6" aria-labelledby={`${workspace}-gate-title`}>
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700">
                <AlertTriangle className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                  Stage gate
                </p>
                <h2 className="mt-1 font-semibold" id={`${workspace}-gate-title`}>
                  当前准入门槛
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{config.gate}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-card" aria-labelledby={`${workspace}-outputs-title`}>
            <div className="border-b px-5 py-4 sm:px-6">
              <h2 className="font-semibold" id={`${workspace}-outputs-title`}>
                计划输出
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">对应 plan.md 的验收结果，不代表当前已有数据。</p>
            </div>
            <div className="grid gap-px bg-border sm:grid-cols-3">
              {config.outputs.map((output, index) => (
                <article className="bg-card p-5" key={output}>
                  <span className="font-mono text-xs font-semibold text-primary">0{index + 1}</span>
                  <p className="mt-3 text-sm font-medium leading-6">{output}</p>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="rounded-xl border bg-card p-5" aria-labelledby={`${workspace}-checks-title`}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            <h2 className="font-semibold" id={`${workspace}-checks-title`}>
              控制边界
            </h2>
          </div>
          <ul className="mt-5 space-y-4">
            {config.checks.map((check) => (
              <li className="flex gap-3 text-sm leading-5" key={check}>
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                <span>{check}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t pt-5">
            <p className="text-xs text-muted-foreground">扫描状态更新时间</p>
            <p className="mt-1 font-mono text-xs">
              {formatDateTime(scanStatus?.completedAt ?? scanStatus?.startedAt ?? null)}
            </p>
            <Link
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              to={config.nextRoute}
            >
              {config.nextLabel}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}

function SignalCard({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof RadioTower;
  label: string;
  value: string;
  tone?: 'default' | 'safe';
}) {
  return (
    <article className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className={`size-4 ${tone === 'safe' ? 'text-emerald-600' : 'text-primary'}`} aria-hidden="true" />
      </div>
      <p className="mt-3 font-mono text-lg font-semibold tabular-nums">{value}</p>
    </article>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[100rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>;
}
