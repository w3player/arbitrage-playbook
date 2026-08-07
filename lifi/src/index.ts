import { Command } from 'commander';
import { createBacktestCommand, createStressCommand } from './cmd/backtest/index.js';
import { createCollectCommand } from './cmd/collector/index.js';
import { logger } from './lib/logger.js';

const program = new Command()
  .name('lifi-backtest')
  .description('LI.FI prefunded inventory backtest')
  .addCommand(createCollectCommand())
  .addCommand(createBacktestCommand())
  .addCommand(createStressCommand());

program.parseAsync().catch((error: unknown) => {
  logger.error({ err: error }, 'command failed');
  process.exitCode = 1;
});
