import { CircleDashed } from 'lucide-react';

import { useScanner } from '@/features/scanner/scanner-provider';

export function PriceScanPage() {
  const { assets } = useScanner();
  const verifiedAssets = assets?.summary.verifiedAssets ?? 0;
  const activePaths = assets?.summary.activePeerPaths ?? 0;

  return (
    <PageShell>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">价差扫描</h1>
        <p className="mt-1 text-xs text-muted-foreground">比较多链报价，并扣除交易、跨链和 Gas 成本后输出净价差。</p>
      </div>

      <dl className="mt-4 grid grid-cols-5 divide-x overflow-hidden rounded-lg border bg-card">
        <Metric label="可扫描资产" value={verifiedAssets} />
        <Metric label="活跃跨链路径" value={activePaths} />
        <Metric label="报价源" value="0" />
        <Metric label="正净价差" value="0" />
        <Metric label="扫描状态" tone="text-amber-700" value="等待价格源" />
      </dl>

      <section className="mt-3 overflow-hidden rounded-lg border bg-card" aria-labelledby="price-scan-title">
        <div className="flex h-10 items-center justify-between gap-4 border-b px-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-semibold" id="price-scan-title">
              价差机会
            </h2>
            <p className="font-mono text-[10px] text-muted-foreground">按净收益率降序 · 0 条结果</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <CircleDashed className="size-3" aria-hidden="true" />
            未接入报价
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-left text-xs">
            <thead className="bg-muted/60 text-[10px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium" scope="col">
                  资产
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  买入链 / 市场 / 价格
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  卖出链 / 市场 / 价格
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  毛价差
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  交易成本
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  跨链 + Gas
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  净价差
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  更新时间
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="h-44 text-center text-xs text-muted-foreground" colSpan={8}>
                  后端尚未接入 DEX/CEX 报价与成本计算，接入后仅展示净价差为正的机会。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </PageShell>
  );
}

function Metric({ label, tone, value }: { label: string; tone?: string; value: number | string }) {
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
