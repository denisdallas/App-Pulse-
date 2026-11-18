import crypto from 'node:crypto';

const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const PASSWORD_KEY_LENGTH = 64;
const LEGACY_SALT = 'apppulse_salt_2026';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, PASSWORD_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  }).toString('hex');
  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt}$${derived}`;
}

export function verifyPassword(password: string, encoded: string): { valid: boolean; needsRehash: boolean } {
  if (encoded.startsWith('scrypt$')) {
    const [, n, r, p, salt, expectedHex] = encoded.split('$');
    if (!n || !r || !p || !salt || !expectedHex || !/^[a-f0-9]+$/i.test(expectedHex)) {
      return { valid: false, needsRehash: false };
    }
    try {
      const expected = Buffer.from(expectedHex, 'hex');
      const actual = crypto.scryptSync(password, salt, expected.length, {
        N: Number(n), r: Number(r), p: Number(p),
      });
      return {
        valid: expected.length === actual.length && crypto.timingSafeEqual(expected, actual),
        needsRehash: Number(n) < SCRYPT_COST,
      };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  // Verify the previous fixed-salt PBKDF2 format once, then callers should rehash it.
  if (/^[a-f0-9]{64}$/i.test(encoded)) {
    const legacy = crypto.pbkdf2Sync(password, LEGACY_SALT, 10000, 32, 'sha256');
    const expected = Buffer.from(encoded, 'hex');
    return {
      valid: expected.length === legacy.length && crypto.timingSafeEqual(expected, legacy),
      needsRehash: true,
    };
  }
  return { valid: false, needsRehash: false };
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function isValidRegistrationInput(email: unknown, password: unknown, name: unknown): boolean {
  return typeof email === 'string'
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    && typeof password === 'string'
    && password.length >= 12
    && password.length <= 256
    && typeof name === 'string'
    && name.trim().length >= 2
    && name.trim().length <= 100;
}

export function isWorkspaceRequestAllowed(sessionWorkspaceId: string, requestedWorkspaceId?: string): boolean {
  return !requestedWorkspaceId || requestedWorkspaceId === sessionWorkspaceId;
}

export function isAdminRole(role: string | undefined): boolean {
  return role === 'admin';
}
