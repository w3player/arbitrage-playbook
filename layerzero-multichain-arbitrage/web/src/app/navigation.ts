import { Boxes, ChartNoAxesCombined, CircleDollarSign, ScanLine } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavigationItem {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  stage?: string;
}

export const navigationItems: NavigationItem[] = [
  {
    to: '/assets',
    label: '资产管理',
    description: '发现与验证跨链资产',
    icon: Boxes,
  },
  {
    to: '/market-prices',
    label: '全链现价',
    description: '比较各链 DEX 池价',
    icon: ScanLine,
  },
  {
    to: '/prices',
    label: '价差扫描',
    description: 'LI.FI 可执行报价比较',
    icon: ChartNoAxesCombined,
  },
  {
    to: '/execution',
    label: '执行',
    description: '提交与跟踪套利任务',
    icon: CircleDollarSign,
    stage: '待开放',
  },
];

export function getNavigationItem(pathname: string) {
  return navigationItems.find((item) => pathname.startsWith(item.to));
}
