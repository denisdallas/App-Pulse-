import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Request, Response } from 'express';
import demoHandler from './demo.ts';

type RoutedRequest = IncomingMessage & {
  query?: Record<string, string | string[] | undefined>;
};

let serverModule: Promise<typeof import('../server.ts')> | null = null;

function lastString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.at(-1);
  return value;
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const routedRequest = request as RoutedRequest;
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  const rewrittenPath = requestUrl.searchParams.getAll('__apppulse_path').at(-1)
    ?? lastString(routedRequest.query?.__apppulse_path);
  const routePath = rewrittenPath ?? (requestUrl.pathname.startsWith('/api/') && requestUrl.pathname !== '/api/handler'
    ? requestUrl.pathname.slice('/api/'.length)
    : undefined);

  if (routePath !== undefined) {
    const normalizedPath = routePath.replace(/^\/+/, '');
    if (!normalizedPath || normalizedPath.split('/').some((segment) => segment === '.' || segment === '..')) {
      response.statusCode = 400;
      response.setHeader('Cache-Control', 'no-store');
      response.end();
      return;
    }

    if (normalizedPath === 'demo') {
      demoHandler(request, response);
      return;
    }

    requestUrl.searchParams.delete('__apppulse_path');
    const query = requestUrl.searchParams.toString();
    request.url = `/api/${normalizedPath}${query ? `?${query}` : ''}`;
  }

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
