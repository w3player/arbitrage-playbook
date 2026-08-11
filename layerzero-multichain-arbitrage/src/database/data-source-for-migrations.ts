import 'dotenv/config';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from './index';

const databasePath = process.env.DATABASE_PATH;

if (!databasePath) {
  throw new Error('DATABASE_PATH is required');
}

export default new DataSource({
  type: 'better-sqlite3',
  database: databasePath,
  entities: ALL_ENTITIES,
  migrations: [join(__dirname, 'migrations', '*.js')],
  migrationsTableName: 'typeorm_migrations',
  migrationsRun: false,
  synchronize: false,
});
