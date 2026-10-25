import { Pool, PoolClient, QueryResultRow } from 'pg';

let applicationPool: Pool | undefined;
let migrationPool: Pool | undefined;

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
  applicationPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Math.max(1, Math.min(30, Number(process.env.DB_POOL_SIZE) || 10)),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'apppulse-intelligence',
  });
  return applicationPool;
}

export function getMigrationPool(): Pool {
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!validPostgresUrl(connectionString)) {
    throw new Error('DATABASE_URL or DATABASE_URL_UNPOOLED must be a valid PostgreSQL connection URL');
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

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
  const result = await getPool().query<T>(text, values);
  return result.rows;
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  let began = false;
  let discardConnection = false;
  try {
    await client.query('BEGIN');
    began = true;
    const result = await work(client);
    await client.query('COMMIT');
    began = false;
    return result;
  } catch (error) {
    if (began) {
      try {
        await client.query('ROLLBACK');
        began = false;
      } catch {
        discardConnection = true;
      }
    }
    throw error;
  } finally {
    if (discardConnection) client.release(new Error('Transaction rollback failed'));
    else client.release();
  }
}

export async function closeDatabase(): Promise<void> {
  const pools = [applicationPool, migrationPool].filter((pool): pool is Pool => Boolean(pool));
  applicationPool = undefined;
  migrationPool = undefined;
  await Promise.all(pools.map((pool) => pool.end()));
}
