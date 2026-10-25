import { attachDatabasePool } from '@vercel/functions';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool, type QueryResultRow } from 'pg';

let applicationPool: Pool | undefined;
let migrationPool: Pool | undefined;
let applicationDatabase: NodePgDatabase | undefined;

export interface DatabaseClient {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

function validPostgresUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:';
  } catch {
    return false;
  }
}

export function databaseConfigured(): boolean {
  return validPostgresUrl(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  if (!validPostgresUrl(process.env.DATABASE_URL)) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL');
  }
  if (!applicationPool) {
    applicationPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Math.max(1, Math.min(30, Number(process.env.DB_POOL_SIZE) || 5)),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'apppulse-intelligence',
    });
    if (process.env.VERCEL === '1') attachDatabasePool(applicationPool);
  }
  return applicationPool;
}

function getDatabase(): NodePgDatabase {
  applicationDatabase ??= drizzle(getPool());
  return applicationDatabase;
}

export function getMigrationPool(): Pool {
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!validPostgresUrl(connectionString)) {
    throw new Error('DATABASE_URL_UNPOOLED or a direct DATABASE_URL must be a valid PostgreSQL connection URL');
  }
  if (new URL(connectionString).hostname.toLowerCase().includes('-pooler')) {
    throw new Error('PostgreSQL migrations require a direct, non-pooled connection URL; configure DATABASE_URL_UNPOOLED');
  }
  migrationPool ??= new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'apppulse-migrations',
  });
  return migrationPool;
}

function parameterizedSql(text: string, values: unknown[]) {
  const chunks: Parameters<typeof sql.join>[0] = [];
  const used = new Set<number>();
  const placeholders = /\$(\d+)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = placeholders.exec(text))) {
    const index = Number(match[1]) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= values.length) {
      throw new Error('Database query contains an invalid parameter placeholder');
    }
    chunks.push(sql.raw(text.slice(cursor, match.index)), sql.param(values[index]));
    used.add(index);
    cursor = match.index + match[0].length;
  }

  if (used.size !== values.length) throw new Error('Database query parameter count does not match its values');
  chunks.push(sql.raw(text.slice(cursor)));
  return sql.join(chunks);
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
  const result = await getDatabase().execute<T>(parameterizedSql(text, values));
  return result.rows as T[];
}

export async function transaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
  return getDatabase().transaction(async (tx) => {
    const client: DatabaseClient = {
      query: async <Row extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) => {
        const result = await tx.execute<Row>(parameterizedSql(text, values));
        return { rows: result.rows as Row[], rowCount: result.rowCount };
      },
    };
    return work(client);
  });
}

export async function closeDatabase(): Promise<void> {
  const pools = [applicationPool, migrationPool].filter((pool): pool is Pool => Boolean(pool));
  applicationPool = undefined;
  migrationPool = undefined;
  applicationDatabase = undefined;
  await Promise.all(pools.map((pool) => pool.end()));
}
