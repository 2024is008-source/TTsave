import { beforeAll, expect, it, vi } from 'vitest';
import {
  AdminSessions,
  hashAdminPassword,
  verifyAdminPassword,
} from '../src/services/admin-auth.js';
import { parseEnvironment } from '../src/config/env.js';
let hash: string;
beforeAll(async () => {
  hash = await hashAdminPassword('fixture-password-not-for-production');
});
it('uses salted hashes, validates passwords and fails closed for malformed hashes', async () => {
  expect(hash).not.toContain('fixture-password');
  expect(await hashAdminPassword('fixture-password-not-for-production')).not.toBe(hash);
  expect(await verifyAdminPassword('fixture-password-not-for-production', hash)).toBe(
    true,
  );
  expect(await verifyAdminPassword('wrong-password', hash)).toBe(false);
  expect(await verifyAdminPassword('wrong', 'invalid')).toBe(false);
});
it('refuses enabling admin with missing or malformed credentials', () => {
  expect(() => parseEnvironment({ ADMIN_ENABLED: 'true' })).toThrow(
    'requires ADMIN_USERNAME',
  );
  expect(() =>
    parseEnvironment({
      ADMIN_ENABLED: 'true',
      ADMIN_USERNAME: 'operator',
      ADMIN_PASSWORD_HASH: 'plaintext',
    }),
  ).toThrow('Invalid environment');
});
it('expires anonymous, idle and absolute sessions and binds CSRF to a live session', () => {
  const now = vi.spyOn(Date, 'now');
  try {
    now.mockReturnValue(0);
    const sessions = new AdminSessions(1000, 2500),
      anonymous = sessions.create(),
      authenticated = sessions.create(true);
    expect(sessions.csrf(authenticated.session, anonymous.session.csrf)).toBe(false);
    expect(sessions.csrf(authenticated.session, authenticated.session.csrf)).toBe(true);
    now.mockReturnValue(900);
    sessions.touch(authenticated.session);
    now.mockReturnValue(1800);
    expect(sessions.get(authenticated.token)).toBeDefined();
    sessions.touch(authenticated.session);
    now.mockReturnValue(2500);
    expect(sessions.get(authenticated.token)).toBeUndefined();
    now.mockReturnValue(600000);
    expect(sessions.get(anonymous.token)).toBeUndefined();
    const active = sessions.create(true);
    now.mockReturnValue(601001);
    expect(sessions.get(active.token)).toBeUndefined();
  } finally {
    now.mockRestore();
  }
});
it('bounds session memory, rejects forged tokens and revokes old sessions', () => {
  const sessions = new AdminSessions(),
    first = sessions.create(true);
  expect(sessions.get('forged')).toBeUndefined();
  sessions.revoke(first.token);
  expect(sessions.get(first.token)).toBeUndefined();
  for (let i = 0; i < 500; i++) sessions.create();
  expect(() => sessions.create()).toThrow('Please try signing in');
});
