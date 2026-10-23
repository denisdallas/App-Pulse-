import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

export interface IDatabase {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<{ rowCount: number }>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  getEngineName(): 'PostgreSQL' | 'SQLite (Durable Relational)';
  isPostgres(): boolean;
  close(): Promise<void>;
}

class RelationalDatabase implements IDatabase {
  private pgPool: pg.Pool | null = null;
  private sqliteDb: DatabaseSync | null = null;
  private engine: 'PostgreSQL' | 'SQLite (Durable Relational)' = 'SQLite (Durable Relational)';

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
      try {
        this.pgPool = new pg.Pool({
          connectionString: databaseUrl,
          ssl: process.env.NODE_ENV === 'production' && !databaseUrl.includes('localhost') ? { rejectUnauthorized: false } : undefined,
        });
        this.engine = 'PostgreSQL';
        console.log('[Database] Initialized PostgreSQL connection pool');
      } catch (err: any) {
        console.warn('[Database] Failed to initialize PostgreSQL pool, falling back to durable SQLite:', err.message);
        this.initSqlite();
      }
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
      const res = await this.pgPool.query(sql, params);
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
      const res = await this.pgPool.query(sql, params);
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
        const result = await fn();
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
