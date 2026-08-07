import { Command, Option } from 'commander';
import { loadConfig } from '../../config.js';
import { QuoteCollector, type CollectorStream } from './collector.js';

interface CollectOptions {
  config: string;
  once?: boolean;
  stream: CollectorStream;
}

async function collect(options: CollectOptions): Promise<void> {
  const config = await loadConfig(options.config);
  const collector = new QuoteCollector(config);
  try {
    if (options.once) {
      process.stdout.write(`${JSON.stringify(await collector.collectOnce(options.stream))}\n`);
      return;
    }

    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort());
    process.once('SIGTERM', () => controller.abort());
    await collector.run(controller.signal);
  } finally {
    collector.close();
  }
}

export function createCollectCommand(): Command {
  return new Command('collect')
    .description('collect LI.FI quotes')
    .option('-c, --config <file>', 'config JSON', 'config/backtest.example.json')
    .option('--once', 'collect one batch')
    .addOption(new Option('--stream <name>', 'quote stream').choices(['same-chain', 'rebalance', 'all']).default('all'))
    .action(collect);
}
