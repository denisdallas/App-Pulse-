import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.development.local', '.env.local', '.env'] });

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

function databaseIdentity(connectionString: string): string {
  const url = new URL(connectionString);
  const hostname = url.hostname.replace(/-pooler(?=\.)/i, '');
  return `${url.protocol}//${hostname}${url.pathname}`;
}

if (testDatabaseUrl) {
  const configuredDatabaseUrls = [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED].filter(
    (value): value is string => Boolean(value),
  );
  const testIdentity = databaseIdentity(testDatabaseUrl);
  if (configuredDatabaseUrls.some((value) => databaseIdentity(value) === testIdentity)) {
    throw new Error('TEST_DATABASE_URL must point to a database separate from DATABASE_URL');
  }
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.DATABASE_URL_UNPOOLED = testDatabaseUrl;
}

const [{ closeDatabase, query }, { getMigrationStatus, migrate }] = await Promise.all([
  import('../server/db.ts'),
  import('../server/migrate.ts'),
]);

after(async () => {
  await closeDatabase();
});

test('isolated PostgreSQL database migrates and accepts parameterized queries', {
  skip: testDatabaseUrl ? false : 'Set TEST_DATABASE_URL to run this isolated database test',
}, async () => {
  await migrate();

  const migrationStatus = await getMigrationStatus();
  assert.equal(migrationStatus.current, true, `Pending migrations: ${migrationStatus.pending.join(', ')}`);

  const result = await query<{ value: number }>('SELECT $1::integer AS value', [42]);
  assert.equal(result[0]?.value, 42);
});
