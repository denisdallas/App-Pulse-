import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Request, Response } from 'express';

let serverModule: Promise<typeof import('../server.ts')> | null = null;

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    serverModule ??= import('../server.ts');
    const { app, initializeServer } = await serverModule;
    await initializeServer();
    await new Promise<void>((resolve, reject) => {
      response.once('finish', resolve);
      response.once('close', resolve);
      response.once('error', reject);
      app(request as Request, response as Response);
    });
  } catch (error) {
    console.error('[Vercel API] Application initialization failed:', error instanceof Error ? error.name : 'Unknown error');
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.statusCode = 503;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'Service temporarily unavailable.' }));
  }
}
