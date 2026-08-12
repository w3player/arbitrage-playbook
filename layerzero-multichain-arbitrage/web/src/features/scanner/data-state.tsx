import { AlertTriangle, Database, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

export function LoadingState() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="正在加载扫描数据" aria-live="polite">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="h-28 animate-pulse rounded-xl border bg-card p-5" key={index}>
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="mt-5 h-8 w-16 rounded bg-muted" />
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
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <h2 className="font-semibold">无法读取扫描数据</h2>
          <p className="mt-1 text-sm leading-6 text-red-800">{message}</p>
          <Button className="mt-4" onClick={() => void retry()} size="sm" type="button" variant="outline">
            重试连接
          </Button>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ action }: { action: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <Database className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">资产池还是空的</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        先执行一次 LayerZero 扫描，验证通过的 OFT 与 OFT Adapter 会出现在这里。
      </p>
      <div className="mt-5">{action}</div>
    </div>
  );
}
