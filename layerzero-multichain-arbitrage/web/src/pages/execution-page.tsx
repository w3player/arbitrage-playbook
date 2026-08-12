import { LockKeyhole } from 'lucide-react';

export function ExecutionPage() {
  return (
    <PageShell>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">执行</h1>
        <p className="mt-1 text-xs text-muted-foreground">管理套利任务、交易签名、跨链状态和最终回执。</p>
      </div>

      <dl className="mt-4 grid grid-cols-5 divide-x overflow-hidden rounded-lg border bg-card">
        <Metric label="待执行" value="0" />
        <Metric label="执行中" value="0" />
        <Metric label="已完成" value="0" />
        <Metric label="失败任务" value="0" />
        <Metric label="执行器" tone="text-amber-700" value="未启用" />
      </dl>

      <section className="mt-3 overflow-hidden rounded-lg border bg-card" aria-labelledby="execution-title">
        <div className="flex h-10 items-center justify-between border-b px-3">
          <h2 className="text-sm font-semibold" id="execution-title">
            执行任务
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
            <LockKeyhole className="size-3" aria-hidden="true" />
            暂未开放
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-left text-xs">
            <thead className="bg-muted/60 text-[10px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium" scope="col">
                  任务 ID
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  资产
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  买入 → 跨链 → 卖出
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  预期净收益
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  阶段
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  交易哈希
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  更新时间
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="h-44 text-center text-xs text-muted-foreground" colSpan={7}>
                  当前不接入私钥、签名器或执行合约；完成价格扫描和风险检查后再启用。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </PageShell>
  );
}

function Metric({ label, tone, value }: { label: string; tone?: string; value: string }) {
  return (
    <div className="px-3 py-2.5">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${tone ?? ''}`}>{value}</dd>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[110rem] px-5 py-4">{children}</div>;
}
