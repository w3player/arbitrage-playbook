import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMarketQuotes1786550400000 implements MigrationInterface {
  name = 'CreateMarketQuotes1786550400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "market_quotes" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "run_id" varchar NOT NULL,
        "asset_id" integer NOT NULL,
        "deployment_id" integer NOT NULL,
        "chain_name" varchar NOT NULL,
        "chain_id" integer NOT NULL,
        "side" varchar NOT NULL,
        "trade_token_address" varchar NOT NULL,
        "settlement_token_address" varchar NOT NULL,
        "settlement_symbol" varchar NOT NULL,
        "token_amount_raw" varchar,
        "token_decimals" integer NOT NULL,
        "settlement_decimals" integer NOT NULL,
        "from_amount_raw" varchar,
        "to_amount_raw" varchar,
        "to_amount_min_raw" varchar,
        "gas_cost_usd_micros" varchar NOT NULL DEFAULT ('0'),
        "included_fee_usd_micros" varchar NOT NULL DEFAULT ('0'),
        "extra_fee_usd_micros" varchar NOT NULL DEFAULT ('0'),
        "tool" varchar,
        "requested_at" datetime NOT NULL,
        "received_at" datetime NOT NULL,
        "duration_ms" integer NOT NULL,
        "valid_until" datetime NOT NULL,
        "status" varchar NOT NULL,
        "error_code" varchar,
        "error_message" text,
        "raw_json" text NOT NULL DEFAULT ('{}'),
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_market_quotes_asset" FOREIGN KEY ("asset_id") REFERENCES "assets" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_market_quotes_deployment" FOREIGN KEY ("deployment_id") REFERENCES "deployments" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_market_quotes_deployment_side_received" ON "market_quotes" ("deployment_id", "side", "received_at")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_market_quotes_asset_received" ON "market_quotes" ("asset_id", "received_at")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_market_quotes_run_status" ON "market_quotes" ("run_id", "status")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_market_quotes_run_status"');
    await queryRunner.query('DROP INDEX "IDX_market_quotes_asset_received"');
    await queryRunner.query(
      'DROP INDEX "IDX_market_quotes_deployment_side_received"',
    );
    await queryRunner.query('DROP TABLE "market_quotes"');
  }
}
