import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMigrationPool, databaseConfigured, query } from './db.ts';

const migrationDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const lockId = 731846029;

async function migrationFiles(): Promise<string[]> {
  return (await fs.readdir(migrationDirectory)).filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file)).sort();
}

export async function migrate(): Promise<void> {
  if (!databaseConfigured()) throw new Error('DATABASE_URL is required before running PostgreSQL migrations');
  const pool = getMigrationPool();
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [lockId]);
    locked = true;
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');

    for (const file of await migrationFiles()) {
      const version = file.replace(/\.sql$/, '');
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
      if (applied.rowCount) continue;

      const sql = await fs.readFile(path.join(migrationDirectory, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT (version) DO NOTHING', [version]);
        await client.query('COMMIT');
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* preserve the migration error */ }
        throw new Error(`Migration ${version} failed; the transaction was rolled back`);
      }
    }
  } finally {
    if (locked) {
      try { await client.query('SELECT pg_advisory_unlock($1)', [lockId]); } catch { /* connection will be released */ }
    }
    client.release();
  }
}

export async function getMigrationStatus(): Promise<{ applied: string[]; pending: string[]; current: boolean }> {
  const files = (await migrationFiles()).map((file) => file.replace(/\.sql$/, ''));
  if (!databaseConfigured()) return { applied: [], pending: files, current: false };

  const table = await query<{ exists: boolean }>("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists");
  if (!table[0]?.exists) return { applied: [], pending: files, current: false };
  const rows = await query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version');
  const applied = rows.map((row) => row.version);
  const appliedSet = new Set(applied);
  const pending = files.filter((version) => !appliedSet.has(version));
  return { applied, pending, current: pending.length === 0 };
}
