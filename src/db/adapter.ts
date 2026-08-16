import mysql from 'mysql2/promise';
import { Pool as PgPool } from 'pg';
import { env } from '../config/env';
import { DatabaseError } from '../errors/errors';
import { logger } from '../logger/logger';

export interface DbClient {
  dialect: 'mysql' | 'postgres';
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  close(): Promise<void>;
}

function toPg(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

class MysqlClient implements DbClient {
  dialect = 'mysql' as const;
  constructor(private readonly pool: mysql.Pool) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await this.pool.query(sql, params as never);
    return rows as T[];
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.pool.execute(sql, params as never);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class PostgresClient implements DbClient {
  dialect = 'postgres' as const;
  constructor(private readonly pool: PgPool) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query(toPg(sql), params);
    return result.rows as T[];
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.pool.query(toPg(sql), params);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

let client: DbClient | null = null;

export async function getDbClient(): Promise<DbClient> {
  if (!env.dbEnabled) {
    throw new DatabaseError('Database is disabled. Set DB_ENABLED=true.', { action: 'db.connect' });
  }
  if (client) return client;

  try {
    if (env.dbType === 'postgres') {
      const pool = new PgPool({
        host: env.dbHost,
        port: env.dbPort,
        user: env.dbUser,
        password: env.dbPassword,
        database: env.dbName,
      });
      await pool.query('SELECT 1');
      client = new PostgresClient(pool);
    } else {
      const pool = mysql.createPool({
        host: env.dbHost,
        port: env.dbPort,
        user: env.dbUser,
        password: env.dbPassword,
        database: env.dbName,
        waitForConnections: true,
        connectionLimit: 10,
      });
      await pool.query('SELECT 1');
      client = new MysqlClient(pool);
    }
    logger.info(`Connected to ${env.dbType} at ${env.dbHost}:${env.dbPort}/${env.dbName}`);
    return client;
  } catch (error) {
    throw new DatabaseError(
      `Failed to connect to ${env.dbType}: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'db.connect', cause: error },
    );
  }
}

export async function tryGetDbClient(): Promise<DbClient | null> {
  if (!env.dbEnabled) return null;
  try {
    return await getDbClient();
  } catch (error) {
    logger.warn(`Database unavailable: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
