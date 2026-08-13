import { RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';

import { StatusBadge } from './status-badge';
import { useScanner } from './scanner-provider';

export function ScanAction({ compact = false }: { compact?: boolean }) {
  const { scanStatus, triggering, triggerScan } = useScanner();
  const [feedback, setFeedback] = useState<string | null>(null);
  const running = scanStatus?.state === 'running';

  async function handleTrigger() {
    try {
      const result = await triggerScan();
      setFeedback(result.status === 'started' ? '后台扫描已启动' : '扫描任务已在运行');
    } catch {
      setFeedback('启动失败，请检查后端服务');
    }
  }

  if (compact) {
    return (
      <Button className="h-9 px-3 text-xs" disabled={triggering || running} onClick={handleTrigger} type="button">
        <RefreshCw className={running ? 'animate-spin' : undefined} data-icon="inline-start" />
        {running ? '扫描中' : '立即扫描'}
      </Button>
    );
  }

  return (
    <section className="rounded-lg border bg-card p-4 shadow-xs" aria-labelledby="scan-action-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Scanner worker</p>
          <h2 className="mt-1 text-lg font-semibold" id="scan-action-title">
            LayerZero 资产扫描
          </h2>
        </div>
        <StatusBadge value={scanStatus?.state ?? 'idle'} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-y py-3 text-xs">
        <div>
          <dt className="text-muted-foreground">最近完成</dt>
          <dd className="mt-1 font-mono text-xs font-medium">{formatDateTime(scanStatus?.completedAt ?? null)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">部署处理</dt>
          <dd className="mt-1 font-mono font-semibold">{scanStatus?.summary?.deployments ?? '—'}</dd>
        </div>
      </dl>
      <Button
        className="mt-3 h-9 w-full text-xs"
        disabled={triggering || running}
        onClick={handleTrigger}
        type="button"
      >
        <RefreshCw className={running ? 'animate-spin' : undefined} data-icon="inline-start" />
        {running ? '扫描正在后台运行' : '启动新扫描'}
      </Button>
      <p className="mt-2 min-h-4 text-[11px] leading-4 text-muted-foreground" aria-live="polite">
        {feedback ?? '任务异步执行，页面会在完成后自动刷新。'}
      </p>
    </section>
  );
}
