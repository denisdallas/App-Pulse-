import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { app } from './server/app.ts';
import { authSecretConfigured } from './server/auth.ts';
import { closeDatabase, databaseConfigured, query } from './server/db.ts';
import { getMigrationStatus, migrate } from './server/migrate.ts';

dotenv.config();

const PORT = Math.max(1, Math.min(65535, Number(process.env.PORT) || 3000));
const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

async function startServer(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!databaseConfigured()) {
    if (isProduction) throw new Error('DATABASE_URL must be configured in production; JSON and memory persistence are not used.');
    console.warn('[AppPulse Server] DATABASE_URL is not configured. Static UI will be served, but authenticated APIs will remain not ready.');
  } else {
    if (!authSecretConfigured()) throw new Error('AUTH_SESSION_SECRET must be at least 32 bytes when DATABASE_URL is configured.');
    await migrate();
    await query('SELECT 1');
    const migrationStatus = await getMigrationStatus();
    if (!migrationStatus.current) throw new Error('PostgreSQL migrations are incomplete; run the configured migration command before starting.');
    console.info(`[AppPulse Server] PostgreSQL is reachable; ${migrationStatus.applied.length} migrations are current.`);
  }

  const distDirectory = path.join(rootDirectory, 'dist');
  const indexFile = path.join(distDirectory, 'index.html');
  if (!fs.existsSync(indexFile)) throw new Error('Built frontend is missing. Run the build command before starting the static server.');

  app.use(express.static(distDirectory, { index: false, fallthrough: true, maxAge: isProduction ? '1h' : 0 }));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'API route not found' });
      return;
    }
    res.sendFile(indexFile);
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.info(`[AppPulse Server] Serving the built frontend and API on port ${PORT}; Vite HMR is not injected into this runtime.`);
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
  process.exit(1);
});
