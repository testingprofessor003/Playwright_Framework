import { getDbClient, closeDb } from './adapter';
import { CREATE_TABLES_MYSQL, CREATE_TABLES_POSTGRES } from './schema';
import { env } from '../config/env';
import { logger } from '../logger/logger';

async function migrate(): Promise<void> {
  if (!env.dbEnabled) {
    logger.warn('DB_ENABLED is false. Enable it in .env before migrating.');
    return;
  }
  const db = await getDbClient();
  const statements = db.dialect === 'postgres' ? CREATE_TABLES_POSTGRES : CREATE_TABLES_MYSQL;
  for (const sql of statements) {
    await db.execute(sql);
  }
  logger.info(`Schema migrated for ${db.dialect} database ${env.dbName}`);
  await closeDb();
}

migrate().catch((error) => {
  logger.error(`Migration failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
