import dotenv from 'dotenv';

dotenv.config({ path: ['.env.development.local', '.env.local', '.env'] });

const args = process.argv.slice(2);
const statusOnly = args.length === 1 && args[0] === '--status';
const validArguments = args.length === 0 || statusOnly;

async function run(): Promise<void> {
  const { closeDatabase, databaseConfigured } = await import('./db.ts');
  const { getMigrationStatus, migrate } = await import('./migrate.ts');

  try {
    if (!validArguments) throw new Error('Usage: bun run db:migrate [--status]');
    if (!databaseConfigured()) throw new Error('DATABASE_URL is required to inspect or migrate the PostgreSQL schema');
    if (!statusOnly) await migrate();

    const status = await getMigrationStatus();
    console.info(`Applied migrations: ${status.applied.length ? status.applied.join(', ') : 'none'}`);
    console.info(`Pending migrations: ${status.pending.length ? status.pending.join(', ') : 'none'}`);
    if (!status.current) process.exitCode = 1;
  } catch (error) {
    console.error(`[AppPulse DB] ${error instanceof Error ? error.message : 'Migration command failed'}`);
    process.exitCode = 1;
  } finally {
    await closeDatabase().catch(() => undefined);
  }
}

await run();
