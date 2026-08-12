export function formatDateTime(value: string | null): string {
  if (!value) return '尚未完成';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function shortAddress(value: string): string {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export const chainLabels: Record<string, string> = {
  ethereum: 'Ethereum',
  bsc: 'BNB Chain',
  base: 'Base',
};
