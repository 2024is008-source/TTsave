import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config/env.js';
import { hashAdminPassword } from '../../src/services/admin-auth.js';
import { OperationsStore } from '../../src/services/operational-analytics.js';
import { MockDownloaderService } from '../fixtures/mock-downloader.js';

let server: Server | undefined,
  store: OperationsStore | undefined,
  root: string,
  base: string;
const password = 'browser-fixture-password-not-production';
test.beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'ttsave-admin-browser-'));
  store = new OperationsStore(root, 'isolated-test-key-not-for-production');
  store.startJob('test-mp4', 'mp4', 'XX');
  store.updateJob('test-mp4', 'ready');
  store.updateJob('test-mp4', 'delivered');
  store.startJob('test-failure', 'mp3', 'LK');
  store.updateJob('test-failure', 'error', 'VIDEO_VERIFICATION_FAILED');
  const config = parseEnvironment({
    NODE_ENV: 'test',
    ADMIN_ENABLED: 'true',
    ADMIN_USERNAME: 'operator',
    ADMIN_PASSWORD_HASH: await hashAdminPassword(password),
    DOWNLOAD_TEMP_ROOT: path.join(root, 'temporary'),
  });
  server = createApp(new MockDownloaderService(), () => true, undefined, {
    store,
    admin: { config },
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No test port');
  base = `http://127.0.0.1:${String(address.port)}`;
});
test.afterAll(async () => {
  const active = server;
  if (active) await new Promise<void>((resolve) => active.close(() => resolve()));
  store?.close();
  if (root) {
    if (
      path.dirname(root) !== path.resolve(tmpdir()) ||
      !path.basename(root).startsWith('ttsave-admin-browser-')
    )
      throw Error('Unsafe cleanup');
    await rm(root, { recursive: true, force: true });
  }
});
for (const width of [320, 768, 1440]) {
  test(`private dashboard login, real fixture totals, accessibility and logout at ${String(width)}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + '/admin');
    await expect(
      page.getByRole('heading', { name: 'Sign in', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Username', { exact: true }).fill('operator');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in securely' }).click();
    await expect(
      page.getByRole('heading', { name: 'Operations', exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByText('VIDEO_VERIFICATION_FAILED', { exact: true }),
    ).toBeVisible();
    const data = await page.request.get(base + '/admin/api/overview');
    expect(data.status()).toBe(200);
    const report = await data.json();
    expect(report.operations.totals.attempts).toBe(2);
    expect(report.operations.totals.delivered).toBe(1);
    expect(report.operations.totals.failed).toBe(1);
    expect(report.google.available).toBe(false);
    expect(await page.locator('script').count()).toBe(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('private-dashboard.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Sign in', exact: true }),
    ).toBeVisible();
    expect((await page.request.get(base + '/admin/api/overview')).status()).toBe(401);
  });
}
