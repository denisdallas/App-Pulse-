import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config({ path: ['.env.development.local', '.env.local', '.env'] });

const [{ app }, { authSecretConfigured }, { closeDatabase, databaseConfigured, query }, { getMigrationStatus }] = await Promise.all([
  import('./app.ts'),
  import('./auth.ts'),
  import('./db.ts'),
  import('./migrate.ts'),
]);

const port = Math.max(1, Math.min(65535, Number(process.env.PORT) || 3000));
const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(serverDirectory, '..');
const publicDirectory = path.join(projectDirectory, 'public');
const indexFile = path.join(publicDirectory, 'index.html');

async function startServer(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!databaseConfigured()) {
    if (isProduction) throw new Error('DATABASE_URL must be configured in production; JSON and memory persistence are not used.');
    console.warn('[AppPulse Server] DATABASE_URL is not configured. Static UI will be served, but authenticated APIs will remain not ready.');
  } else if (!authSecretConfigured()) {
    if (isProduction) throw new Error('AUTH_SESSION_SECRET must be at least 32 bytes when DATABASE_URL is configured.');
    console.warn('[AppPulse Server] AUTH_SESSION_SECRET is not configured; authenticated APIs will remain not ready.');
  } else {
    try {
      await query('SELECT 1');
      const migrationStatus = await getMigrationStatus();
      if (!migrationStatus.current) {
        console.warn(`[AppPulse Server] PostgreSQL is reachable; pending migrations: ${migrationStatus.pending.join(', ')}. Apply them explicitly before using authenticated APIs.`);
      } else {
        console.info(`[AppPulse Server] PostgreSQL is reachable; ${migrationStatus.applied.length} migrations are current.`);
      }
    } catch {
      console.warn('[AppPulse Server] PostgreSQL health check failed; API readiness remains not ready.');
    }
  }

  if (!fs.existsSync(indexFile)) throw new Error('Built frontend is missing. Run the build command before starting the static server.');

  app.use(express.static(publicDirectory, { index: false, fallthrough: true, maxAge: isProduction ? '1h' : 0 }));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'API route not found' });
      return;
    }
    res.sendFile(indexFile);
  });

  const server = app.listen(port, '0.0.0.0', () => {
    console.info(`[AppPulse Server] Serving the built frontend and API on port ${port}; Vite HMR is not injected into this runtime.`);
  });

  const shutdown = () => {
    server.close(() => {
      void closeDatabase().finally(() => process.exit(0));
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

startServer().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  console.error(`[AppPulse Server] Startup failed: ${message}`);
  await closeDatabase().catch(() => undefined);
  process.exitCode = 1;
});
