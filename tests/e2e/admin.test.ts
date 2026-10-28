import { beforeAll, expect, it, vi } from 'vitest';
import request from 'supertest';
import { JSDOM } from 'jsdom';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config/env.js';
import { hashAdminPassword, AdminSessions } from '../../src/services/admin-auth.js';
import { OperationsStore } from '../../src/services/operational-analytics.js';
import { MockDownloaderService } from '../fixtures/mock-downloader.js';
import type { AdminOptions } from '../../src/routes/admin.js';
let hash: string;
async function removeFixture(directory: string) {
  if (
    path.dirname(directory) !== path.resolve(tmpdir()) ||
    !path.basename(directory).startsWith('ttsave-admin-test-')
  )
    throw Error('Unsafe cleanup');
  await rm(directory, { recursive: true, force: true });
}
const password = 'admin-test-password-not-a-real-credential';
beforeAll(async () => {
  hash = await hashAdminPassword(password);
});
const csrf = (html: string) =>
  new JSDOM(html).window.document.querySelector<HTMLInputElement>('input[name="csrf"]')
    ?.value ?? '';
const cookie = (response: { headers: Record<string, unknown> }) =>
  String(response.headers['set-cookie']).split(';')[0] ?? '';
const monitor = vi.fn(() =>
  Promise.resolve({
    applicationReady: true,
    uptimeSeconds: 10,
    memory: process.memoryUsage(),
    queue: null,
    checkedAt: new Date().toISOString(),
    tools: { ffmpeg: true, ffprobe: true, ytDlp: true, chrome: true, mp3: true },
    disk: null,
    temporary: { available: false, bytes: 0, files: 0, directories: 0, partial: false },
  }),
);
function setup(extra: Partial<AdminOptions> = {}, store?: OperationsStore) {
  return createApp(new MockDownloaderService(), () => true, undefined, {
    ...(store ? { store } : {}),
    admin: {
      config: parseEnvironment({
        ADMIN_ENABLED: 'true',
        ADMIN_USERNAME: 'operator',
        ADMIN_PASSWORD_HASH: hash,
      }),
      monitor,
      ...extra,
    },
  });
}
async function login(app: ReturnType<typeof setup>) {
  const page = await request(app).get('/admin/login').expect(200);
  const response = await request(app)
    .post('/admin/login')
    .set('Cookie', cookie(page))
    .type('form')
    .send({ username: 'operator', password, csrf: csrf(page.text) })
    .expect(303);
  return { authenticated: cookie(response), anonymous: cookie(page) };
}
it('protects pages/APIs, rotates sessions, enforces logout CSRF and revokes the cookie', async () => {
  const app = setup();
  await request(app).get('/admin').expect(303).expect('Location', '/admin/login');
  await request(app).get('/admin/api/overview').expect(401);
  const { authenticated, anonymous } = await login(app);
  expect(authenticated).not.toBe(anonymous);
  await request(app).get('/admin/api/overview').set('Cookie', anonymous).expect(401);
  const dashboard = await request(app)
    .get('/admin')
    .set('Cookie', authenticated)
    .expect(200);
  expect(dashboard.text).toContain('Operational recording is disabled');
  expect(dashboard.text).not.toMatch(/googletagmanager|advertising\.js|gtag\(/);
  expect(dashboard.headers['cache-control']).toContain('no-store');
  expect(dashboard.headers['x-robots-tag']).toContain('noindex');
  await request(app)
    .post('/admin/logout')
    .set('Cookie', authenticated)
    .send({ csrf: 'wrong' })
    .expect(403);
  await request(app)
    .post('/admin/logout')
    .set('Cookie', authenticated)
    .type('form')
    .send({ csrf: csrf(dashboard.text) })
    .expect(303);
  await request(app).get('/admin/api/overview').set('Cookie', authenticated).expect(401);
});
it('rejects login CSRF, cross-site requests, forged cookies and wrong credentials generically', async () => {
  const app = setup(),
    page = await request(app).get('/admin/login').expect(200);
  const body = { username: 'operator', password, csrf: csrf(page.text) };
  await request(app).post('/admin/login').type('form').send(body).expect(403);
  await request(app)
    .post('/admin/login')
    .set('Cookie', cookie(page))
    .set('Origin', 'https://evil.example')
    .send(body)
    .expect(403);
  const bad = await request(app)
    .post('/admin/login')
    .set('Cookie', cookie(page))
    .send({ ...body, username: 'unknown', password: 'wrong-password' })
    .expect(401);
  expect(bad.text).toContain('The username or password is incorrect');
  expect(bad.text).not.toContain(hash);
  await request(app)
    .get('/admin/api/overview')
    .set('Cookie', 'ttsave_admin=' + 'a'.repeat(43))
    .expect(401);
});
it('limits login attempts and sets production Secure/HttpOnly/SameSite cookies', async () => {
  const app = setup(),
    page = await request(app).get('/admin/login');
  for (let i = 0; i < 5; i++)
    await request(app).post('/admin/login').send({}).expect(403);
  await request(app).post('/admin/login').send({}).expect(429);
  const production = setup({
    config: parseEnvironment({
      NODE_ENV: 'production',
      PUBLIC_BASE_URL: 'https://tiksavemp4.online',
      ADMIN_ENABLED: 'true',
      ADMIN_USERNAME: 'operator',
      ADMIN_PASSWORD_HASH: hash,
    }),
  });
  const result = await request(production).get('/admin/login').expect(200);
  expect(String(result.headers['set-cookie'])).toMatch(/__Secure-ttsave_admin=/);
  expect(String(result.headers['set-cookie'])).toContain('Secure');
  expect(String(result.headers['set-cookie'])).toContain('HttpOnly');
  expect(String(result.headers['set-cookie'])).toContain('SameSite=Strict');
  expect(page.status).toBe(200);
});
it('protects expired sessions and checks ranges before invoking reports', async () => {
  const sessions = new AdminSessions(-1),
    app = setup({ sessions });
  // A deliberately expired authenticated fixture never grants access.
  const token = sessions.create(true).token;
  await request(app)
    .get('/admin/api/overview')
    .set('Cookie', 'ttsave_admin=' + token)
    .expect(401);
  const valid = setup(),
    { authenticated } = await login(valid);
  await request(valid)
    .get('/admin/api/overview?from=2026-10-28&to=2026-10-01')
    .set('Cookie', authenticated)
    .expect(400);
});
it('reuses actual recorded delivery totals and shows only authorized, sanitized GA4 traffic', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ttsave-admin-test-'));
  const store = new OperationsStore(
    directory,
    'test-only-key-for-isolated-admin-fixture',
  );
  try {
    store.startJob('fixture-job', 'mp3', 'LK');
    store.updateJob('fixture-job', 'ready');
    store.updateJob('fixture-job', 'delivered');
    const google: typeof import('../../src/services/ga4-reports.js').ga4Reports = () =>
      Promise.resolve({
        available: true,
        message: 'Fixture authorized API data',
        reports: [
          { name: 'Overview', headers: ['activeUsers'], rows: [['12']] },
          {
            name: 'Countries',
            headers: ['country', 'activeUsers'],
            rows: [['Sri Lanka', '12']],
          },
          {
            name: 'Popular pages',
            headers: ['pagePath'],
            rows: [['/private?token=secret']],
          },
        ],
      });
    const app = setup({ google }, store),
      { authenticated } = await login(app);
    const response = await request(app)
      .get('/admin/api/overview')
      .set('Cookie', authenticated)
      .expect(200);
    expect(response.body.operations.totals.delivered).toBe(1);
    expect(response.body.operations.byType).toEqual([
      { type: 'mp3', attempts: 1, delivered: 1, failed: 0 },
    ]);
    expect(response.body.google.available).toBe(true);
    expect(response.text).toContain('Sri Lanka');
    expect(response.text).not.toMatch(/fixture-job|token=secret|private\?/);
    await request(app).get('/admin').set('Cookie', authenticated).expect(200);
  } finally {
    store.close();
    await removeFixture(directory);
  }
});
