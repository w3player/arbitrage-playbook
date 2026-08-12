import { cn } from '@/lib/utils';

const labels: Record<string, string> = {
  idle: '空闲',
  running: '扫描中',
  failed: '失败',
  verified: '已验证',
  pending: '待验证',
  rejected: '已拒绝',
  discovered: '已发现',
  active: '双向可用',
  one_way: '单向',
  unknown: '未知',
  direct_oft: 'Direct OFT',
  oft_adapter: 'OFT Adapter',
};

const tones: Record<string, string> = {
  idle: 'border-slate-200 bg-slate-50 text-slate-700',
  running: 'border-blue-200 bg-blue-50 text-blue-700',
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  discovered: 'border-amber-200 bg-amber-50 text-amber-800',
  failed: 'border-red-200 bg-red-50 text-red-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
  one_way: 'border-orange-200 bg-orange-50 text-orange-800',
  direct_oft: 'border-violet-200 bg-violet-50 text-violet-700',
  oft_adapter: 'border-cyan-200 bg-cyan-50 text-cyan-700',
};

export function StatusBadge({ value, className }: { value: string | null; className?: string }) {
  const normalized = value ?? 'unknown';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[normalized] ?? 'border-border bg-muted text-muted-foreground',
        className,
      )}
    >
      {labels[normalized] ?? normalized}
    </span>
  );
}
