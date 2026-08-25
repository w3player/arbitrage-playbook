import { loadConfig, requiredEnv } from './config.js';
import { V2PoolMonitor } from './monitor.js';

async function main(): Promise<void> {
  const configPath = process.argv[2] ?? 'config.json';
  const config = await loadConfig(configPath);
  const monitor = new V2PoolMonitor(config, {
    httpUrl: requiredEnv(config.chain.httpRpcEnv),
    wsUrl: requiredEnv(config.chain.wsRpcEnv),
  });

  const shutdown = async (signal: string) => {
    console.log(`[monitor] received ${signal}; stopping`);
    await monitor.stop();
    process.exitCode = 0;
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  await monitor.start();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
