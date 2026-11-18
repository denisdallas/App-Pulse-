import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import demoHandler from '../api/demo.ts';
import apiHandler from '../api/[...path].ts';

const port = Number(process.env.PORT) || 4179;

const server = createServer((request: IncomingMessage, response: ServerResponse) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  const handler = pathname === '/api/demo' ? demoHandler : apiHandler;
  Promise.resolve(handler(request, response)).catch(() => {
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
