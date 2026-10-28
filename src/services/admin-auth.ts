import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '../middleware/error-handler.js';
import { adminHashSchema } from '../shared/admin-settings.js';

const tokenSchema = z
  .string()
  .length(43)
  .regex(/^[A-Za-z0-9_-]+$/);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const opaque = () => randomBytes(32).toString('base64url');
let hashing = 0;

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (hashing >= 2)
    throw new HttpError(503, 'ADMIN_BUSY', 'Please try signing in again shortly.');
  hashing++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        password,
        salt,
        64,
        { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
        (error, key) => {
          if (error) reject(error);
          else resolve(key);
        },
      );
    });
  } finally {
    hashing--;
  }
}

export async function hashAdminPassword(password: string) {
  z.string().min(12).max(256).parse(password);
  const salt = randomBytes(16);
  return `scrypt$1$${salt.toString('base64url')}$${(await derive(password, salt)).toString('base64url')}`;
}

export async function verifyAdminPassword(password: string, encoded: string) {
  const parsed = adminHashSchema.safeParse(encoded);
  if (!parsed.success || !z.string().min(1).max(256).safeParse(password).success)
    return false;
  const parts = parsed.data.split('$');
  const salt = Buffer.from(parts[2] ?? '', 'base64url');
  const expected = Buffer.from(parts[3] ?? '', 'base64url');
  const actual = await derive(password, salt);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

export function equalAdminValue(a: string, b: string) {
  const first = createHash('sha256').update(a).digest();
  const second = createHash('sha256').update(b).digest();
  return timingSafeEqual(first, second);
}

export type AdminSession = {
  authenticated: boolean;
  csrf: string;
  created: number;
  seen: number;
};

/** Single-fork, bounded, server-side sessions. Only a token digest is retained.
 * Restart or credential changes revoke sessions; no operational data is involved. */
export class AdminSessions {
  private readonly entries = new Map<string, AdminSession>();
  constructor(
    private readonly idleMs = 30 * 60000,
    private readonly absoluteMs = 8 * 3600000,
  ) {}
  private expired(session: AdminSession) {
    const now = Date.now();
    return session.authenticated
      ? now - session.seen >= this.idleMs || now - session.created >= this.absoluteMs
      : now - session.created >= 10 * 60000;
  }
  create(authenticated = false) {
    for (const [key, value] of this.entries)
      if (this.expired(value)) this.entries.delete(key);
    if (this.entries.size >= 500)
      throw new HttpError(503, 'ADMIN_BUSY', 'Please try signing in again shortly.');
    const token = opaque();
    const session = {
      authenticated,
      csrf: opaque(),
      created: Date.now(),
      seen: Date.now(),
    };
    this.entries.set(digest(token), session);
    return { token, session };
  }
  get(token: string | undefined) {
    if (!token || !tokenSchema.safeParse(token).success) return undefined;
    const key = digest(token),
      session = this.entries.get(key);
    if (!session) return undefined;
    if (this.expired(session)) {
      this.entries.delete(key);
      return undefined;
    }
    return session;
  }
  touch(session: AdminSession) {
    session.seen = Date.now();
  }
  revoke(token: string | undefined) {
    if (token) this.entries.delete(digest(token));
  }
  csrf(session: AdminSession | undefined, value: unknown) {
    return (
      !!session &&
      typeof value === 'string' &&
      tokenSchema.safeParse(value).success &&
      equalAdminValue(session.csrf, value)
    );
  }
}
