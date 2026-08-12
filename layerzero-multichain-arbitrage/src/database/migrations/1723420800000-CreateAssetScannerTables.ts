import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAssetScannerTables1723420800000 implements MigrationInterface {
  name = 'CreateAssetScannerTables1723420800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "assets" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "source_key" varchar NOT NULL,
        "name" varchar NOT NULL,
        "symbol" varchar NOT NULL,
        "crosschain_type" varchar,
        "trust_grade" varchar NOT NULL DEFAULT ('C'),
        "status" varchar NOT NULL DEFAULT ('pending'),
        "first_discovered_at" datetime NOT NULL DEFAULT (datetime('now')),
        "last_verified_at" datetime,
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_assets_source_key" UNIQUE ("source_key")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "deployments" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "asset_id" integer NOT NULL,
        "chain_name" varchar NOT NULL,
        "chain_id" integer,
        "endpoint_id" integer,
        "oft_address" varchar NOT NULL,
        "token_address" varchar,
        "implementation_address" varchar,
        "admin_address" varchar,
        "endpoint_address" varchar,
        "name" varchar,
        "symbol" varchar,
        "local_decimals" integer,
        "shared_decimals" integer,
        "asset_type" varchar,
        "approval_required" boolean,
        "owner" varchar,
        "paused" boolean,
        "bytecode_hash" varchar,
        "peers_json" text NOT NULL DEFAULT ('{}'),
        "quote_json" text NOT NULL DEFAULT ('{}'),
        "evidence_json" text NOT NULL DEFAULT ('{}'),
        "config_hash" varchar,
        "scan_status" varchar NOT NULL DEFAULT ('discovered'),
        "error_reason" text,
        "last_scanned_block" varchar,
        "last_scanned_at" datetime,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_deployments_chain_oft" UNIQUE ("chain_name", "oft_address"),
        CONSTRAINT "FK_deployments_asset" FOREIGN KEY ("asset_id") REFERENCES "assets" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_deployments_asset_id" ON "deployments" ("asset_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_deployments_status" ON "deployments" ("scan_status")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_deployments_status"');
    await queryRunner.query('DROP INDEX "IDX_deployments_asset_id"');
    await queryRunner.query('DROP TABLE "deployments"');
    await queryRunner.query('DROP TABLE "assets"');
  }
}
