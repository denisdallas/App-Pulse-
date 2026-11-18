import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildPublicDemoPayload } from '../server/demo.ts';

export default function handler(_request: IncomingMessage, response: ServerResponse) {
  response.statusCode = 200;
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  response.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(buildPublicDemoPayload()));
}
