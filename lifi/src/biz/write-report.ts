import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stringify } from 'csv-stringify/sync';
import type { AppConfig } from '../config.js';
import type { BacktestResult, InventoryBalance } from '../types/types.js';
import { formatUnits, formatUsd } from '../utils/index.js';

function jsonValue(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

function inventoryLine(
  chainName: string,
  balance: InventoryBalance,
  wethDecimals: number,
  usdcDecimals: number,
): string {
  const totalWeth = balance.wethAvailable + balance.wethReserved + balance.wethPending + balance.wethStranded;
  const totalUsdc = balance.usdcAvailable + balance.usdcReserved + balance.usdcPending + balance.usdcStranded;
  return `| ${chainName} | ${formatUnits(totalWeth, wethDecimals, 6)} | ${formatUnits(totalUsdc, usdcDecimals, 2)} | ${formatUnits(balance.wethStranded, wethDecimals, 6)} WETH / ${formatUnits(balance.usdcStranded, usdcDecimals, 2)} USDC |`;
}

function summaryMarkdown(result: BacktestResult, config: AppConfig): string {
  const wins = result.trades.filter((trade) => trade.outcome === 'both-succeeded').length;
  const recovered = result.trades.filter((trade) => trade.outcome.endsWith('recovered')).length;
  const unresolved = result.trades.filter((trade) => trade.outcome.endsWith('unresolved')).length;
  const rejected = Object.entries(result.opportunitiesRejected)
    .sort((left, right) => right[1] - left[1])
    .map(([reason, count]) => `| ${reason} | ${count} |`)
    .join('\n');
  const inventory = config.chains
    .map((chain) => {
      const balance = result.finalInventory[chain.chainId];
      return balance ? inventoryLine(chain.name, balance, chain.wethDecimals, chain.usdcDecimals) : '';
    })
    .join('\n');

  return `# 多链预置库存套利回测结果

时间：${new Date(result.startedAtMs).toISOString()} 至 ${new Date(result.endedAtMs).toISOString()}

## 核心结果

| 指标 | 结果 |
| --- | ---: |
| 初始资金 | $${formatUsd(result.initialCapitalUsdMicros)} |
| 策略最终价值 | $${formatUsd(result.finalStrategyValueUsdMicros)} |
| 原样持有最终价值 | $${formatUsd(result.finalHoldValueUsdMicros)} |
| 相对原样持有多赚/少赚 | $${formatUsd(result.excessValueUsdMicros)} |
| 链上手续费等外部成本 | $${formatUsd(result.externalCostUsdMicros)} |
| 最大回撤 | $${formatUsd(result.maxDrawdownUsdMicros)}（${(result.maxDrawdownBps / 100).toFixed(2)}%） |

## 成交与失败

| 指标 | 数量 |
| --- | ---: |
| 看到的候选机会 | ${result.opportunitiesSeen} |
| 发起的交易 | ${result.trades.length} |
| 买入和卖出都成功 | ${wins} |
| 只有一笔成功、随后恢复 | ${recovered} |
| 只有一笔成功、未能恢复 | ${unresolved} |
| 补库存操作 | ${result.rebalances.length} |

## 没有下单的原因

| 原因 | 次数 |
| --- | ---: |
${rejected || '| 无 | 0 |'}

## 最终库存

| 链 | WETH 总量 | USDC 总量 | 暂时不可用库存 |
| --- | ---: | ---: | ---: |
${inventory}

说明：策略价值包含可用、冻结、跨链途中和暂时不可用的资产；已经明确丢失的跨链资产不计入。外部成本从策略价值中扣除。原样持有基准使用同一份初始 WETH/USDC，并按回测中的 WETH 标记价格估值。
`;
}

export async function writeBacktestReport(result: BacktestResult, config: AppConfig, outputDir: string): Promise<void> {
  const directory = resolve(outputDir);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(resolve(directory, 'summary.md'), summaryMarkdown(result, config), 'utf8'),
    writeFile(resolve(directory, 'result.json'), `${JSON.stringify(result, jsonValue, 2)}\n`, 'utf8'),
    writeFile(
      resolve(directory, 'trades.csv'),
      stringify([
        [
          'id',
          'decision_at',
          'settled_at',
          'buy_chain',
          'sell_chain',
          'target_weth_wei',
          'expected_net_usd',
          'realized_cash_pnl_usd',
          'cost_usd',
          'outcome',
          'recovery_at',
        ],
        ...result.trades.map((trade) => [
          trade.id,
          new Date(trade.decisionAtMs).toISOString(),
          new Date(trade.settledAtMs).toISOString(),
          trade.buyChainId,
          trade.sellChainId,
          trade.targetWeth,
          formatUsd(trade.expectedNetUsdMicros),
          trade.realizedCashPnlUsdMicros === undefined ? undefined : formatUsd(trade.realizedCashPnlUsdMicros),
          formatUsd(trade.costUsdMicros),
          trade.outcome,
          trade.recoveryAtMs === undefined ? undefined : new Date(trade.recoveryAtMs).toISOString(),
        ]),
      ]),
    ),
    writeFile(
      resolve(directory, 'rebalances.csv'),
      stringify([
        [
          'id',
          'started_at',
          'completed_at',
          'from_chain',
          'to_chain',
          'asset',
          'from_amount_raw',
          'to_amount_min_raw',
          'cost_usd',
          'outcome',
        ],
        ...result.rebalances.map((rebalance) => [
          rebalance.id,
          new Date(rebalance.startedAtMs).toISOString(),
          new Date(rebalance.completedAtMs).toISOString(),
          rebalance.fromChainId,
          rebalance.toChainId,
          rebalance.assetSymbol,
          rebalance.fromAmount,
          rebalance.toAmountMin,
          formatUsd(rebalance.costUsdMicros),
          rebalance.outcome,
        ]),
      ]),
    ),
    writeFile(
      resolve(directory, 'equity.csv'),
      stringify([
        ['timestamp', 'strategy_value_usd', 'hold_value_usd', 'excess_value_usd', 'external_cost_usd'],
        ...result.equity.map((point) => [
          new Date(point.timestampMs).toISOString(),
          formatUsd(point.strategyValueUsdMicros),
          formatUsd(point.holdValueUsdMicros),
          formatUsd(point.excessValueUsdMicros),
          formatUsd(point.externalCostUsdMicros),
        ]),
      ]),
    ),
  ]);
}
