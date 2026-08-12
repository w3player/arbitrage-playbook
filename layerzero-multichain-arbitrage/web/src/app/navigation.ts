import { Boxes, ChartNoAxesCombined, CircleDollarSign } from 'lucide-react';
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
    to: '/prices',
    label: '价差扫描',
    description: '比较多链价格与成本',
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
