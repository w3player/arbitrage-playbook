import { setTimeout as delay } from 'node:timers/promises';
import pLimit from 'p-limit';
import type { AppConfig } from '../../config.js';
import type { RawQuoteRecord } from '../../types/types.js';
import { LifiClient } from '../../lib/lifi-client.js';
import { logger } from '../../lib/logger.js';
import { QuoteStore } from '../../biz/sqlite-store.js';
import { buildRebalanceTasks, buildSameChainTasks } from './tasks.js';

export interface CollectorSummary {
  attempted: number;
  succeeded: number;
  failed: number;
}

export type CollectorStream = 'same-chain' | 'rebalance' | 'all';

export class QuoteCollector {
  private readonly client: LifiClient;
  private readonly store: QuoteStore;

  constructor(private readonly config: AppConfig) {
    this.client = new LifiClient(config.lifi);
    this.store = new QuoteStore(config.sqlitePath);
  }

  async collectOnce(stream: CollectorStream = 'all'): Promise<CollectorSummary> {
    const tasks = [
      ...(stream === 'rebalance' ? [] : buildSameChainTasks(this.config)),
      ...(stream === 'same-chain' ? [] : buildRebalanceTasks(this.config)),
    ];
    const limit = pLimit(this.config.lifi.maxConcurrency);
    const records = await Promise.all(tasks.map((task) => limit(() => this.collect(task))));
    const succeeded = records.filter((record) => !record.error).length;
    return { attempted: records.length, succeeded, failed: records.length - succeeded };
  }

  async run(signal: AbortSignal): Promise<void> {
    if (!process.env[this.config.lifi.apiKeyEnv]) {
      throw new Error(`Continuous collection requires ${this.config.lifi.apiKeyEnv}; use --once without a key`);
    }
    await Promise.all([
      this.loop('same-chain', this.config.lifi.sameChainIntervalMs, signal),
      this.loop('rebalance', this.config.lifi.rebalanceIntervalMs, signal),
    ]);
  }

  close(): void {
    this.store.close();
  }

  private async collect(task: Parameters<LifiClient['quote']>[0]): Promise<RawQuoteRecord> {
    const record = await this.client.quote(task);
    this.store.insert(record);
    return record;
  }

  private async loop(stream: 'same-chain' | 'rebalance', intervalMs: number, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const started = Date.now();
      const summary = await this.collectOnce(stream);
      logger.info({ stream, ...summary, durationMs: Date.now() - started }, 'quote batch collected');
      await delay(Math.max(0, intervalMs - (Date.now() - started)), undefined, { signal }).catch(() => undefined);
    }
  }
}
