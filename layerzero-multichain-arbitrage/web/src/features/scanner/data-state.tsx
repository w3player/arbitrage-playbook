import { AlertTriangle, Database, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

export function LoadingState() {
  return (
    <div className="grid grid-cols-4 gap-2" aria-label="正在加载扫描数据" aria-live="polite">
      {Array.from({ length: 8 }).map((_, index) => (
        <div className="h-20 animate-pulse rounded-lg border bg-card p-3" key={index}>
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="mt-3 h-6 w-12 rounded bg-muted" />
        </div>
      ))}
      <span className="sr-only">
        <LoaderCircle /> 正在加载
      </span>
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry: () => Promise<void> }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900" role="alert">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <h2 className="font-semibold">无法读取扫描数据</h2>
          <p className="mt-1 text-sm leading-6 text-red-800">{message}</p>
          <Button className="mt-3" onClick={() => void retry()} size="sm" type="button" variant="outline">
            重试连接
          </Button>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ action }: { action: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-card px-5 py-8 text-center">
      <Database className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-3 text-base font-semibold">资产池还是空的</h2>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
        先执行一次 LayerZero 扫描，验证通过的 OFT 与 OFT Adapter 会出现在这里。
      </p>
      <div className="mt-3">{action}</div>
    </div>
  );
}
