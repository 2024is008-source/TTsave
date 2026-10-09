/// <reference lib="dom" />
import { once } from 'node:events';
import type { Server } from 'node:http';
import { expect, test } from '@playwright/test';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';

let server: Server;
let origin: string;
const originalId = env.GA_MEASUREMENT_ID;
test.beforeAll(async () => {
  env.GA_MEASUREMENT_ID = 'G-TEST123456';
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test address');
  origin = `http://127.0.0.1:${String(address.port)}`;
});
test.afterAll(async () => {
  env.GA_MEASUREMENT_ID = originalId;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test('CSP permits the external initializer and exactly one stubbed tag; downloader data stays out', async ({
  page,
}) => {
  let loads = 0;
  await page.route('https://www.googletagmanager.com/**', async (route) => {
    loads += 1;
    await route.fulfill({
      contentType: 'application/javascript',
      body: '/* Google tag stub: no network collection in tests. */',
    });
  });
  await page.route('https://*.google-analytics.com/**', (route) => route.abort());
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'INVALID_URL', message: 'Test fixture' } }),
    }),
  );
  await page.goto(`${origin}/?token=SECRET&url=SECRET#signed-url`);
  await expect(page.locator('#video-url')).toBeVisible();
  await page.locator('#video-url').fill('https://www.tiktok.com/@SECRET/video/123');
  await page.evaluate(() => {
    document.title = 'SECRET TikTok title';
    document.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true }));
    history.pushState({}, '', '/?filename=SECRET.mp4#token');
  });
  const commands: unknown[][] = await page.evaluate(() => {
    const queue = Reflect.get(window, 'dataLayer') as IArguments[];
    return queue.map((args) => Array.from(args) as unknown[]);
  });
  expect(loads).toBe(1);
  expect(commands).toHaveLength(3);
  expect(commands[2]).toEqual([
    'event',
    'page_view',
    {
      send_to: 'G-TEST123456',
      page_location: 'https://tiksavemp4.online/',
      page_title: 'TikTok Downloader – Download MP4, MP3 & Photos | TikSaveMP4',
      page_referrer: '',
    },
  ]);
  expect(JSON.stringify(commands)).not.toMatch(/SECRET|signed-url|tiktok\.com/);
});

test('blocked Google tag leaves the public UI usable', async ({ page }) => {
  await page.route('https://www.googletagmanager.com/**', (route) => route.abort());
  await page.goto(origin);
  await expect(page.locator('#video-url')).toBeVisible();
  await page.locator('#video-url').fill('https://www.tiktok.com/@test/video/123');
  await expect(page.locator('#video-url')).toHaveValue(
    'https://www.tiktok.com/@test/video/123',
  );
});
