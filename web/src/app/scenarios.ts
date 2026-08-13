import {
  ArrowLeftRight,
  Boxes,
  CircleDollarSign,
  GitCompareArrows,
  Network,
  Orbit,
  RefreshCcw,
  Route,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type ScenarioStatus = 'available' | 'designing' | 'planned';

export interface ArbitrageScenario {
  id: string;
  name: string;
  description: string;
  route: string;
  icon: LucideIcon;
  status: ScenarioStatus;
  scope: string;
  stages: string[];
}

export const arbitrageScenarios: ArbitrageScenario[] = [
  {
    id: 'layerzero-transfer',
    name: 'LayerZero 跨链资产套利',
    description: '发现 OFT/OFTAdapter，比较多链 DEX 价格，并通过 LayerZero 通道执行搬运。',
    route: '/layerzero/assets',
    icon: Orbit,
    status: 'available',
    scope: '跨链 · OFT',
    stages: ['资产发现', '市场扫描', '价差确认', '跨链执行'],
  },
  {
    id: 'same-chain-dex',
    name: '同链 DEX 套利',
    description: '比较同一条链上的多个池和聚合路由，识别可在单笔交易内完成的价差。',
    route: '/scenarios/same-chain-dex',
    icon: ArrowLeftRight,
    status: 'designing',
    scope: '同链 · 原子执行',
    stages: ['池发现', '路径报价', '原子执行'],
  },
  {
    id: 'prefunded-cross-chain',
    name: '预置库存跨链套利',
    description: '两条链并行买卖锁定价差，再通过跨链桥进行库存再平衡。',
    route: '/scenarios/prefunded-cross-chain',
    icon: Boxes,
    status: 'planned',
    scope: '跨链 · 库存',
    stages: ['库存监控', '双边报价', '并行成交', '再平衡'],
  },
  {
    id: 'stablecoin-basis',
    name: '稳定币跨链基差',
    description: '监控同一稳定币在不同网络的折溢价、桥接成本和资金回流周期。',
    route: '/scenarios/stablecoin-basis',
    icon: CircleDollarSign,
    status: 'planned',
    scope: '跨链 · 稳定币',
    stages: ['基差监控', '深度确认', '桥接结算'],
  },
  {
    id: 'solver-vs-dex',
    name: 'Solver 与 DEX 价差',
    description: '对比意图式 Solver、RFQ 和公开 DEX 的可执行价格与结算约束。',
    route: '/scenarios/solver-vs-dex',
    icon: GitCompareArrows,
    status: 'planned',
    scope: '意图 · RFQ',
    stages: ['RFQ 采集', 'DEX 对照', '结算验证'],
  },
  {
    id: 'cross-chain-cycle',
    name: '跨链循环套利',
    description: '在多资产、多网络之间搜索闭环路径，统一计算兑换、桥接和执行成本。',
    route: '/scenarios/cross-chain-cycle',
    icon: Route,
    status: 'planned',
    scope: '跨链 · 多跳',
    stages: ['图谱构建', '负环搜索', '路径执行'],
  },
  {
    id: 'cex-dex',
    name: 'CEX 与 DEX 套利',
    description: '联合订单簿、链上池和充提状态，评估中心化与链上市场之间的价差。',
    route: '/scenarios/cex-dex',
    icon: Network,
    status: 'planned',
    scope: 'CEX · DEX',
    stages: ['行情归一', '深度比较', '充提监控'],
  },
  {
    id: 'yield-rotation',
    name: '收益金库轮动',
    description: '比较多链金库的净 APY、退出成本和跨链迁移时间，寻找可持续收益差。',
    route: '/scenarios/yield-rotation',
    icon: RefreshCcw,
    status: 'planned',
    scope: 'DeFi · 收益',
    stages: ['收益采集', '风险归一', '仓位迁移'],
  },
];

export function findScenario(id: string | undefined) {
  return arbitrageScenarios.find((scenario) => scenario.id === id);
}
