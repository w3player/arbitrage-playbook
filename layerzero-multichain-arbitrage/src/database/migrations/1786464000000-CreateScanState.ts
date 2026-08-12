import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateScanState1786464000000 implements MigrationInterface {
  name = 'CreateScanState1786464000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "scan_state" (
        "key" varchar PRIMARY KEY NOT NULL,
        "value_json" text NOT NULL DEFAULT ('{}'),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "scan_state"');
  }
}
