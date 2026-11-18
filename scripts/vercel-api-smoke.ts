import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import apiHandler from '../api/handler.ts';

const port = Number(process.env.PORT) || 4179;

const server = createServer((request: IncomingMessage, response: ServerResponse) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  const routePath = pathname.startsWith('/api/') ? pathname.slice('/api/'.length) : '';
  request.url = `/api/handler?__apppulse_path=${encodeURIComponent(routePath)}`;
  Promise.resolve(apiHandler(request, response)).catch(() => {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.statusCode = 500;
    response.end();
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[Vercel API smoke] Listening on port ${port}`);
});
