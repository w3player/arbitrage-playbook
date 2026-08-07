import type { AppConfig } from '../../config.js'
import type { BacktestResult, NormalizedQuote, OpportunityFrame } from '../../types/types.js'
import { mulDiv } from '../../utils/index.js'
import { BacktestEngine } from './engine.js'
import { buildOpportunityFrames } from './frames.js'

export interface StressRun {
  id: string
  name: string
  result: BacktestResult
}

interface Scenario {
  id: string
  name: string
  config?: (config: AppConfig) => void
  quotes?: (quotes: NormalizedQuote[], config: AppConfig) => NormalizedQuote[]
  frames?: (frames: OpportunityFrame[]) => OpportunityFrame[]
}

type ConfigTransform = NonNullable<Scenario['config']>
type QuoteTransform = NonNullable<Scenario['quotes']>
type FrameTransform = NonNullable<Scenario['frames']>

const gas = (factor: bigint): QuoteTransform =>
  (quotes) => quotes.map((quote) => ({ ...quote, gasUsdMicros: quote.gasUsdMicros * factor }))

const delay = (factor: number): ConfigTransform =>
  (config) => { config.backtest.executionDelayMs *= factor }

const wethShock = (bps: bigint): FrameTransform =>
  (frames) => frames.map((frame, index) => index < frames.length / 2
    ? frame
    : { ...frame, markWethPriceUsdMicros: mulDiv(frame.markWethPriceUsdMicros, bps, 10_000n) })

const scenarios: Scenario[] = [
  { id: 'baseline', name: '正常参数' },
  { id: 'gas-2x', name: '网络手续费 2 倍', quotes: gas(2n) },
  { id: 'gas-5x', name: '网络手续费 5 倍', quotes: gas(5n) },
  { id: 'gas-10x', name: '网络手续费 10 倍', quotes: gas(10n) },
  { id: 'delay-2x', name: '执行延迟 2 倍', config: delay(2) },
  { id: 'delay-5x', name: '执行延迟 5 倍', config: delay(5) },
  {
    id: 'thin-liquidity',
    name: '买卖价格各恶化 0.2%',
    quotes: (quotes) => quotes.map((quote) => quote.kind === 'buy-exact-output'
      ? { ...quote, fromAmount: mulDiv(quote.fromAmount, 10_020n, 10_000n) + 1n }
      : quote.kind === 'sell-exact-input'
        ? { ...quote, toAmount: mulDiv(quote.toAmount, 9_980n, 10_000n), toAmountMin: mulDiv(quote.toAmountMin, 9_980n, 10_000n) }
        : quote),
  },
  { id: 'api-gaps', name: '规律漏掉三分之一报价', quotes: (quotes) => quotes.filter((_quote, index) => index % 3 !== 2) },
  {
    id: 'single-chain-outage',
    name: '第一条链中断 1 小时',
    quotes: (quotes, config) => {
      const chainId = config.chains[0]?.chainId
      const middle = ((quotes[0]?.receivedAtMs ?? 0) + (quotes.at(-1)?.receivedAtMs ?? 0)) / 2
      return quotes.filter((quote) => Math.abs(quote.receivedAtMs - middle) > 30 * 60_000 ||
        (quote.fromChainId !== chainId && quote.toChainId !== chainId))
    },
  },
  {
    id: 'higher-failures',
    name: '买卖各 5% 失败',
    config: (config) => { config.backtest.failure = { correlatedFailureBps: 100, buyFailureBps: 500, sellFailureBps: 500 } },
  },
  {
    id: 'bridge-slow-5x',
    name: '跨链耗时 5 倍',
    config: (config) => { config.backtest.rebalance.defaultDurationMs *= 5 },
    quotes: (quotes) => quotes.map((quote) => quote.kind === 'bridge-exact-input'
      ? { ...quote, executionDurationMs: quote.executionDurationMs * 5 }
      : quote),
  },
  {
    id: 'bridge-anomalies',
    name: '跨链异常概率提高',
    config: (config) => Object.assign(config.backtest.rebalance, {
      completedBps: 8500, refundedBps: 700, partialBps: 500, failedBps: 300,
    }),
  },
  {
    id: 'one-direction',
    name: '只保留一个套利方向',
    frames: (frames) => {
      const first = frames[0]
      return first ? frames.filter((frame) => frame.buyChainId === first.buyChainId && frame.sellChainId === first.sellChainId) : frames
    },
  },
  { id: 'weth-down-30', name: '后半段 WETH 估值下跌 30%', frames: wethShock(7_000n) },
  { id: 'weth-up-30', name: '后半段 WETH 估值上涨 30%', frames: wethShock(13_000n) },
]

export function runStressTests(
  sourceConfig: AppConfig,
  sourceQuotes: NormalizedQuote[],
  range?: { fromMs?: number; toMs?: number },
): StressRun[] {
  return scenarios.map((scenario) => {
    const config = JSON.parse(JSON.stringify(sourceConfig)) as AppConfig
    scenario.config?.(config)
    const copied = sourceQuotes.map((quote) => ({ ...quote }))
    const quotes = scenario.quotes?.(copied, config) ?? copied
    const built = buildOpportunityFrames(quotes, config)
    const frames = scenario.frames?.(built) ?? built
    return { id: scenario.id, name: scenario.name, result: new BacktestEngine(config, quotes).run(frames, range) }
  })
}
