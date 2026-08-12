import { copyText } from '@bizjs/biz-utils';
import { Check, Copy, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { shortAddress } from '@/lib/format';

type CopyState = 'idle' | 'copied' | 'error';

export function CopyAddress({ address, label }: { address: string; label: string }) {
  const [state, setState] = useState<CopyState>('idle');
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  async function handleCopy() {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    try {
      await copyText(address);
      setState('copied');
    } catch {
      setState('error');
    }
    resetTimer.current = window.setTimeout(() => setState('idle'), 1600);
  }

  const feedback = state === 'copied' ? '已复制' : state === 'error' ? '复制失败' : '点击复制完整地址';

  return (
    <button
      aria-label={`复制 ${label} 地址 ${address}`}
      className={`group inline-flex min-h-7 items-center gap-1 rounded px-1.5 font-mono text-[10px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 ${
        state === 'copied'
          ? 'bg-emerald-50 text-emerald-700'
          : state === 'error'
            ? 'bg-red-50 text-red-700'
            : 'hover:bg-muted hover:text-foreground'
      }`}
      onClick={() => void handleCopy()}
      title={`${feedback}：${address}`}
      type="button"
    >
      <span className="text-muted-foreground group-hover:text-current">{label}</span>
      <span>{shortAddress(address)}</span>
      {state === 'copied' ? (
        <Check className="size-3 shrink-0" aria-hidden="true" />
      ) : state === 'error' ? (
        <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
      ) : (
        <Copy className="size-3 shrink-0 text-muted-foreground group-hover:text-current" aria-hidden="true" />
      )}
      <span className="sr-only" aria-live="polite">
        {state === 'idle' ? '' : feedback}
      </span>
    </button>
  );
}
