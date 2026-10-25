import crypto from 'node:crypto';
import { closeDatabase, databaseConfigured } from './db.ts';
import { migrate } from './migrate.ts';
import { processNextJob } from './job-worker.ts';

const workerId = process.env.JOB_WORKER_ID?.slice(0, 160) || `worker_${crypto.randomUUID()}`;
const pollInterval = Math.max(250, Math.min(60_000, Number(process.env.JOB_WORKER_POLL_MS) || 2_000));
let stopping = false;

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

async function run(): Promise<void> {
  if (!databaseConfigured()) throw new Error('DATABASE_URL is required to run the background worker');
  await migrate();
  while (!stopping) {
    try {
      const processed = await processNextJob(workerId);
      if (processed) {
        console.info(`[AppPulse Worker] job ${processed.id} reached ${processed.status}`);
        continue;
      }
    } catch {
      console.error('[AppPulse Worker] Queue access failed; the worker will retry after the poll interval.');
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
  await closeDatabase();
}

run().catch(async () => {
  console.error('[AppPulse Worker] Startup failed; verify database configuration and migrations.');
  await closeDatabase().catch(() => undefined);
  process.exitCode = 1;
});
