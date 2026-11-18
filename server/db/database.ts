import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface IDatabase {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<{ rowCount: number }>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  getEngineName(): 'PostgreSQL' | 'SQLite (Durable Relational)';
  isPostgres(): boolean;
  incrementAuthRateLimit(keyHash: string, now: number, resetAt: number): Promise<{ count: number; resetAt: number }>;
  close(): Promise<void>;
}

class RelationalDatabase implements IDatabase {
  private pgPool: pg.Pool | null = null;
  private readonly pgTransactionContext = new AsyncLocalStorage<pg.PoolClient>();
  private sqliteDb: DatabaseSync | null = null;
  private engine: 'PostgreSQL' | 'SQLite (Durable Relational)' = 'SQLite (Durable Relational)';

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    const isProduction = process.env.NODE_ENV === 'production';

    // Vercel/serverless instances do not provide durable local storage. Never
    // silently fall back to per-instance SQLite in production: doing so would
    // split users, sessions, workspace data, and rate limits across instances.
    if (isProduction && !databaseUrl) {
      throw new Error('[Database] DATABASE_URL is required in production; refusing ephemeral SQLite fallback.');
    }

    if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
      try {
        this.pgPool = new pg.Pool({
          connectionString: databaseUrl,
          ssl: isProduction && !databaseUrl.includes('localhost') ? { rejectUnauthorized: false } : undefined,
        });
        this.engine = 'PostgreSQL';
        console.log('[Database] Initialized PostgreSQL connection pool');
      } catch (err: any) {
        if (isProduction) {
          throw new Error('[Database] Failed to initialize PostgreSQL in production; refusing SQLite fallback.', { cause: err });
        }
        console.warn('[Database] Failed to initialize PostgreSQL pool, falling back to durable SQLite in development:', err.message);
        this.initSqlite();
      }
    } else if (databaseUrl) {
      if (isProduction) throw new Error('[Database] DATABASE_URL must use postgres:// or postgresql:// in production.');
      console.warn('[Database] Unsupported DATABASE_URL scheme; using SQLite for local development.');
      this.initSqlite();
    } else {
      this.initSqlite();
    }
  }

  private initSqlite() {
    const dataDir = path.join(process.cwd(), 'server', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'apppulse.db');
    this.sqliteDb = new DatabaseSync(dbPath);
    // Enable WAL mode and foreign keys for ACID resilience and relational constraints
    this.sqliteDb.exec('PRAGMA journal_mode = WAL;');
    this.sqliteDb.exec('PRAGMA foreign_keys = ON;');
    this.engine = 'SQLite (Durable Relational)';
    console.log(`[Database] Initialized Durable Relational SQLite at ${dbPath} (WAL & Foreign Keys Enabled)`);
  }

  getEngineName() {
    return this.engine;
  }

  isPostgres() {
    return this.engine === 'PostgreSQL';
  }

  private convertSqlForEngine(sql: string): string {
    if (this.engine === 'PostgreSQL') {
      return sql;
    }
    // Convert $1, $2, ... to ? for SQLite
    return sql.replace(/\$\d+/g, '?');
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (this.pgPool) {
      const client = this.pgTransactionContext.getStore();
      const res = client
        ? await client.query(sql, params)
        : await this.pgPool.query(sql, params);
      return res.rows as T[];
    }

    if (this.sqliteDb) {
      const sqliteSql = this.convertSqlForEngine(sql);
      const stmt = this.sqliteDb.prepare(sqliteSql);
      // SQLite params
      const rows = stmt.all(...params);
      return rows as T[];
    }

    throw new Error('Database not initialized');
  }

  async execute(sql: string, params: any[] = []): Promise<{ rowCount: number }> {
    if (this.pgPool) {
      const client = this.pgTransactionContext.getStore();
      const res = client
        ? await client.query(sql, params)
        : await this.pgPool.query(sql, params);
      return { rowCount: res.rowCount || 0 };
    }

    if (this.sqliteDb) {
      const sqliteSql = this.convertSqlForEngine(sql);
      const stmt = this.sqliteDb.prepare(sqliteSql);
      const res = stmt.run(...params);
      return { rowCount: Number(res.changes) };
    }

    throw new Error('Database not initialized');
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        // Route every db.query/db.execute call made inside fn through this
        // checked-out client so the work is actually covered by BEGIN/COMMIT.
        const result = await this.pgTransactionContext.run(client, fn);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    if (this.sqliteDb) {
      this.sqliteDb.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn();
        this.sqliteDb.exec('COMMIT');
        return result;
      } catch (e) {
        this.sqliteDb.exec('ROLLBACK');
        throw e;
      }
    }

    throw new Error('Database not initialized');
  }

  async incrementAuthRateLimit(keyHash: string, now: number, resetAt: number): Promise<{ count: number; resetAt: number }> {
    return this.transaction(async () => {
      // Expired keys are removed under the same transaction as the increment.
      await this.execute('DELETE FROM auth_rate_limits WHERE reset_at <= $1', [now]);
      const rows = await this.query<{ count: number; reset_at: number }>(
        `INSERT INTO auth_rate_limits (key_hash, count, reset_at)
         VALUES ($1, 1, $3)
         ON CONFLICT (key_hash) DO UPDATE SET
           count = CASE WHEN auth_rate_limits.reset_at <= $2 THEN 1 ELSE auth_rate_limits.count + 1 END,
           reset_at = CASE WHEN auth_rate_limits.reset_at <= $2 THEN $3 ELSE auth_rate_limits.reset_at END
         RETURNING count, reset_at`,
        [keyHash, now, resetAt]
      );
      return { count: Number(rows[0].count), resetAt: Number(rows[0].reset_at) };
    });
  }

  async close(): Promise<void> {
    if (this.pgPool) {
      await this.pgPool.end();
    }
    if (this.sqliteDb) {
      this.sqliteDb.close();
    }
  }
}

export const db: IDatabase = new RelationalDatabase();
