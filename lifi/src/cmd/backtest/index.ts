import { resolve } from 'node:path';
import { Command } from 'commander';
import { normalizeQuotes } from '../../biz/normalize-quote.js';
import { QuoteStore } from '../../biz/sqlite-store.js';
import { writeBacktestReport } from '../../biz/write-report.js';
import { writeStressReport } from '../../biz/write-stress-report.js';
import { loadConfig, type AppConfig } from '../../config.js';
import type { NormalizedQuote } from '../../types/types.js';
import { formatUsd } from '../../utils/index.js';
import { BacktestEngine } from './engine.js';
import { buildOpportunityFrames } from './frames.js';
import { runStressTests } from './stress.js';

interface RangeOptions {
  config: string;
  from?: string;
  to?: string;
  output?: string;
}

function timestamp(value: string | undefined, name: string): number | undefined {
  if (!value) return undefined;
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new Error(`${name} is not a valid timestamp: ${value}`);
  return result;
}

function range(options: RangeOptions): { fromMs?: number; toMs?: number } {
  const fromMs = timestamp(options.from, '--from');
  const toMs = timestamp(options.to, '--to');
  return { ...(fromMs === undefined ? {} : { fromMs }), ...(toMs === undefined ? {} : { toMs }) };
}

function rangeCommand(name: string, description: string): Command {
  return new Command(name)
    .description(description)
    .option('-c, --config <file>', 'config JSON', 'config/backtest.example.json')
    .option('--from <ISO>', 'first quote time')
    .option('--to <ISO>', 'last quote time')
    .option('-o, --output <dir>', 'report directory');
}

function loadQuotes(config: AppConfig, selected: ReturnType<typeof range>): NormalizedQuote[] {
  const store = new QuoteStore(config.sqlitePath);
  try {
    return normalizeQuotes(
      store.load({
        ...(selected.fromMs === undefined ? {} : { fromMs: selected.fromMs - config.backtest.maxQuoteAgeMs }),
        ...(selected.toMs === undefined ? {} : { toMs: selected.toMs + config.backtest.emergencyMaxDelayMs }),
      }),
    );
  } finally {
    store.close();
  }
}

async function backtest(options: RangeOptions): Promise<void> {
  const config = await loadConfig(options.config);
  const selected = range(options);
  const quotes = loadQuotes(config, selected);
  const result = new BacktestEngine(config, quotes).run(buildOpportunityFrames(quotes, config), selected);
  const output = resolve(options.output ?? `reports/${new Date().toISOString().replaceAll(':', '-')}`);
  await writeBacktestReport(result, config, output);
  process.stdout.write(
    `报价 ${quotes.length}，交易 ${result.trades.length}，相对持有 ${formatUsd(result.excessValueUsdMicros)} USD\n报告：${output}\n`,
  );
}

async function stress(options: RangeOptions): Promise<void> {
  const config = await loadConfig(options.config);
  const selected = range(options);
  const output = resolve(options.output ?? `reports/stress-${new Date().toISOString().replaceAll(':', '-')}`);
  const runs = runStressTests(config, loadQuotes(config, selected), selected);
  await writeStressReport(runs, config, output);
  process.stdout.write(`完成 ${runs.length} 组压力测试\n报告：${output}\n`);
}

export function createBacktestCommand(): Command {
  return rangeCommand('backtest', 'run one backtest').action(backtest);
}

export function createStressCommand(): Command {
  return rangeCommand('stress', 'run stress scenarios').action(stress);
}
