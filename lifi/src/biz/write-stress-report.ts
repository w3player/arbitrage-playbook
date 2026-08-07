import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { AppConfig } from '../config.js'
import type { StressRun } from '../cmd/backtest/stress.js'
import { formatUsd } from '../utils/index.js'
import { writeBacktestReport } from './write-report.js'

export async function writeStressReport(runs: StressRun[], config: AppConfig, outputDir: string): Promise<void> {
  const directory = resolve(outputDir)
  await mkdir(directory, { recursive: true })
  await Promise.all(runs.map((run) => writeBacktestReport(run.result, config, resolve(directory, run.id))))
  const rows = runs.map((run) => {
    const unresolved = run.result.trades.filter((trade) => trade.outcome.endsWith('unresolved')).length
    return `| ${run.name} | ${run.result.trades.length} | $${formatUsd(run.result.excessValueUsdMicros)} | ${(run.result.maxDrawdownBps / 100).toFixed(2)}% | ${unresolved} |`
  })
  const markdown = `# 压力测试对比

| 情景 | 交易数 | 相对原样持有 | 最大回撤 | 买入或卖出只有一笔成功且未恢复 |
|---|---:|---:|---:|---:|
${rows.join('\n')}

每个子目录都包含该情景的完整报告。压力测试是人为假设，不是实际失败概率预测。
`
  await writeFile(resolve(directory, 'stress-summary.md'), markdown, 'utf8')
}
