import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { RawQuoteRecord } from '../types/types.js';

export interface QuoteRecordFilter {
  fromMs?: number;
  toMs?: number;
  stream?: string;
}

export class QuoteStore {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS quote_events (
        id TEXT PRIMARY KEY,
        requested_at_ms INTEGER NOT NULL,
        received_at_ms INTEGER NOT NULL,
        stream TEXT NOT NULL,
        kind TEXT NOT NULL,
        from_chain_id INTEGER NOT NULL,
        to_chain_id INTEGER NOT NULL,
        asset_symbol TEXT NOT NULL,
        has_error INTEGER NOT NULL,
        raw_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS quote_events_time_idx ON quote_events(received_at_ms);
      CREATE INDEX IF NOT EXISTS quote_events_lookup_idx
        ON quote_events(stream, kind, from_chain_id, to_chain_id, asset_symbol, received_at_ms);
    `);
  }

  insert(record: RawQuoteRecord): void {
    const statement = this.database.prepare(`
      INSERT OR IGNORE INTO quote_events (
        id, requested_at_ms, received_at_ms, stream, kind,
        from_chain_id, to_chain_id, asset_symbol, has_error, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    statement.run(
      record.id,
      Date.parse(record.requestedAt),
      Date.parse(record.receivedAt),
      record.request.stream,
      record.request.kind,
      record.request.fromChainId,
      record.request.toChainId,
      record.request.assetSymbol,
      record.error ? 1 : 0,
      JSON.stringify(record),
    );
  }

  load(filter: QuoteRecordFilter = {}): RawQuoteRecord[] {
    const conditions = ['has_error = 0'];
    const values: Array<string | number> = [];
    if (filter.fromMs !== undefined) {
      conditions.push('received_at_ms >= ?');
      values.push(filter.fromMs);
    }
    if (filter.toMs !== undefined) {
      conditions.push('received_at_ms <= ?');
      values.push(filter.toMs);
    }
    if (filter.stream !== undefined) {
      conditions.push('stream = ?');
      values.push(filter.stream);
    }
    const rows = this.database
      .prepare(`SELECT raw_json FROM quote_events WHERE ${conditions.join(' AND ')} ORDER BY received_at_ms`)
      .all(...values) as Array<{ raw_json: string }>;
    return rows.map((row) => JSON.parse(row.raw_json) as RawQuoteRecord);
  }

  count(): number {
    const row = this.database.prepare('SELECT COUNT(*) AS count FROM quote_events').get() as { count: number };
    return row.count;
  }

  close(): void {
    this.database.close();
  }
}
