import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { query, transaction } from './db.ts';

const SESSION_COOKIE = 'apppulse_session';
const SESSION_DAYS = 30;

export interface AuthenticatedWorkspace {
  userId: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: 'owner' | 'member';
}

export function authSecretConfigured(): boolean {
  const secret = process.env.AUTH_SESSION_SECRET;
  return Boolean(secret && Buffer.byteLength(secret) >= 32 && !/^(?:replace|change[-_ ]?me|your[-_ ]|example|placeholder)/i.test(secret));
}

function hash(value: string): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!authSecretConfigured() || !secret) throw new Error('AUTH_SESSION_SECRET must contain at least 32 bytes');
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function passwordHash(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function passwordMatches(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected || !/^[a-f0-9]{128}$/i.test(expected)) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

export function tokenCookie(res: Response, token: string, expires: Date): void {
  const flags = [`${SESSION_COOKIE}=${token}`, `Expires=${expires.toUTCString()}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (process.env.NODE_ENV === 'production') flags.push('Secure');
  res.setHeader('Set-Cookie', flags.join('; '));
}

export function requestToken(req: Request): string | undefined {
  const header = req.headers.cookie || '';
  const entry = header.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${SESSION_COOKIE}=`));
  return entry?.slice(SESSION_COOKIE.length + 1);
}

async function createSessionWithClient(client: { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> }, userId: string, workspaceId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await client.query('INSERT INTO sessions(id,user_id,workspace_id,token_hash,expires_at) VALUES ($1,$2,$3,$4,$5)', [`ses_${crypto.randomUUID()}`, userId, workspaceId, hash(token), expires.toISOString()]);
  await client.query(
    `INSERT INTO audit_events(id,workspace_id,user_id,action,entity_type,details)
     VALUES ($1,$2,$3,'LOGIN','Session',$4::jsonb)`,
    [`audit_${crypto.randomUUID()}`, workspaceId, userId, JSON.stringify({ event: 'session_created' })],
  );
  return { token, expires, user: { id: userId, workspaceId } };
}

export async function register(email: string, password: string, workspaceName: string) {
  const normalized = email.trim().toLowerCase();
  const cleanWorkspaceName = workspaceName.trim();
  if (!/^\S+@\S+\.\S+$/.test(normalized) || normalized.length > 254 || password.length < 12 || password.length > 256) {
    throw new Error('Use a valid email and a password between 12 and 256 characters');
  }
  if (!cleanWorkspaceName || cleanWorkspaceName.length > 120) throw new Error('Workspace name must be between 1 and 120 characters');

  return transaction(async (client) => {
    const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [normalized]);
    if (existing.rows.length) throw new Error('Unable to register with these details');
    const userId = `usr_${crypto.randomUUID()}`;
    const workspaceId = `ws_${crypto.randomUUID()}`;
    await client.query('INSERT INTO users(id,email,password_hash) VALUES ($1,$2,$3)', [userId, normalized, passwordHash(password)]);
    await client.query('INSERT INTO workspaces(id,name) VALUES ($1,$2)', [workspaceId, cleanWorkspaceName]);
    await client.query('INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ($1,$2,$3)', [workspaceId, userId, 'owner']);
    return createSessionWithClient(client, userId, workspaceId);
  });
}

export async function login(email: string, password: string) {
  const rows = await query<{ id: string; password_hash: string; workspace_id: string }>(
    `SELECT u.id, u.password_hash, wm.workspace_id
     FROM users u JOIN workspace_members wm ON wm.user_id = u.id
     WHERE u.email = $1 ORDER BY (wm.role = 'owner') DESC, wm.created_at ASC LIMIT 1`,
    [email.trim().toLowerCase()],
  );
  if (!rows[0] || !passwordMatches(password, rows[0].password_hash)) throw new Error('Invalid email or password');
  return transaction((client) => createSessionWithClient(client, rows[0].id, rows[0].workspace_id));
}

export async function currentSession(token?: string): Promise<AuthenticatedWorkspace | null> {
  if (!token) return null;
  const rows = await query<AuthenticatedWorkspace>(
    `SELECT s.user_id AS "userId", s.workspace_id AS "workspaceId", w.name AS "workspaceName", u.email, wm.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN workspace_members wm ON wm.workspace_id = s.workspace_id AND wm.user_id = s.user_id
     JOIN workspaces w ON w.id = wm.workspace_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()
     LIMIT 1`,
    [hash(token)],
  );
  return rows[0] || null;
}

export async function logout(token?: string): Promise<void> {
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [hash(token)]);
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await currentSession(requestToken(req));
    if (!session) { res.status(401).json({ error: 'Authentication required' }); return; }
    res.locals.auth = session;
    next();
  } catch {
    res.status(503).json({ error: 'Authentication service unavailable' });
  }
}

export { SESSION_COOKIE };
