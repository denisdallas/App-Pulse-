import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { query, transaction } from './db.ts';

const SESSION_COOKIE = 'apppulse_session';
const SESSION_DAYS = 30;

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function passwordHash(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function passwordMatches(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

function tokenCookie(res: Response, token: string, expires: Date): void {
  const flags = [`${SESSION_COOKIE}=${token}`, `Expires=${expires.toUTCString()}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (process.env.NODE_ENV === 'production') flags.push('Secure');
  res.setHeader('Set-Cookie', flags.join('; '));
}

function requestToken(req: Request): string | undefined {
  const header = req.headers.cookie || '';
  const entry = header.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${SESSION_COOKIE}=`));
  return entry?.slice(SESSION_COOKIE.length + 1);
}

export async function register(email: string, password: string, workspaceName: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalized) || password.length < 12) throw new Error('Use a valid email and a password of at least 12 characters');
  return transaction(async (client) => {
    const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [normalized]);
    if (existing.rowCount) throw new Error('An account with that email already exists');
    const userId = `usr_${crypto.randomUUID()}`;
    const workspaceId = `ws_${crypto.randomUUID()}`;
    await client.query('INSERT INTO users(id,email,password_hash) VALUES ($1,$2,$3)', [userId, normalized, passwordHash(password)]);
    await client.query('INSERT INTO workspaces(id,name) VALUES ($1,$2)', [workspaceId, workspaceName.trim() || 'My Workspace']);
    await client.query('INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ($1,$2,$3)', [workspaceId, userId, 'owner']);
    return createSessionWithClient(client, userId, workspaceId);
  });
}

async function createSessionWithClient(client: { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> }, userId: string, workspaceId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await client.query('INSERT INTO sessions(id,user_id,workspace_id,token_hash,expires_at) VALUES ($1,$2,$3,$4,$5)', [`ses_${crypto.randomUUID()}`, userId, workspaceId, hash(token), expires.toISOString()]);
  return { token, expires, user: { id: userId, workspaceId } };
}

export async function login(email: string, password: string) {
  const rows = await query<{ id: string; password_hash: string; workspace_id: string }>('SELECT u.id, u.password_hash, wm.workspace_id FROM users u JOIN workspace_members wm ON wm.user_id = u.id AND wm.role = \'owner\' WHERE u.email = $1 LIMIT 1', [email.trim().toLowerCase()]);
  if (!rows[0] || !passwordMatches(password, rows[0].password_hash)) throw new Error('Invalid email or password');
  return transaction((client) => createSessionWithClient(client, rows[0].id, rows[0].workspace_id));
}

export async function currentSession(token?: string) {
  if (!token) return null;
  const rows = await query<{ user_id: string; workspace_id: string; email: string }>('SELECT s.user_id, s.workspace_id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()', [hash(token)]);
  return rows[0] ? { userId: rows[0].user_id, workspaceId: rows[0].workspace_id, email: rows[0].email } : null;
}

export async function logout(token?: string): Promise<void> {
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [hash(token)]);
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await currentSession(req.cookies?.[SESSION_COOKIE]);
    if (!session) { res.status(401).json({ error: 'Authentication required' }); return; }
    res.locals.auth = session;
    next();
  } catch { res.status(503).json({ error: 'Authentication service unavailable' }); }
}

export { SESSION_COOKIE, tokenCookie, requestToken };
