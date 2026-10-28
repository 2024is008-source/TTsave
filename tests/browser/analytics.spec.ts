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

// Transport contract fixture: serializes queued page-view parameters without loading
// Google's SDK or sending any hits to a real Analytics property.
const collectionStub = `
  const config = Array.from(window.dataLayer.find(entry => entry[0] === 'config'));
  for (const entry of window.dataLayer) {
    if (entry[0] !== 'event' || entry[1] !== 'page_view') continue;
    const values = { ...config[2], ...entry[2] };
    fetch('https://www.google-analytics.com/g/collect', {
      method: 'POST',
      body: new URLSearchParams({
        tid: values.send_to, en: entry[1], dl: values.page_location,
        dt: values.page_title, dr: values.page_referrer
      })
    });
  }
`;

for (const [referrer, expected] of [
  ['https://www.google.com/search?q=SECRET', 'https://www.google.com'],
  ['https://www.bing.com/search?q=SECRET', 'https://www.bing.com'],
  ['https://news.example.org/story/SECRET?campaign=SECRET', 'https://news.example.org'],
  ['', ''],
  ['https://tiksavemp4.online/privacy', ''],
  ['https://news.example.org/?access_token=SECRET', ''],
] as const) {
  test(`origin-only collection contract for ${referrer === '' ? 'direct visit' : referrer}`, async ({
    page,
  }) => {
    const payloads: Record<string, string>[] = [];
    let tagLoads = 0;
    await page.route('https://*.google-analytics.com/**', async (route) => {
      payloads.push(
        Object.fromEntries(new URLSearchParams(route.request().postData() ?? '')),
      );
      await route.fulfill({
        status: 204,
        headers: { 'access-control-allow-origin': '*' },
        body: '',
      });
    });
    await page.route('https://www.googletagmanager.com/**', async (route) => {
      tagLoads += 1;
      await route.fulfill({
        contentType: 'application/javascript',
        body: collectionStub,
      });
    });
    await page.goto(
      `${origin}/?token=SECRET#SECRET`,
      referrer ? { referer: referrer } : {},
    );
    expect(await page.evaluate(() => document.referrer)).toBe(referrer);
    expect(tagLoads).toBe(0);
    await page.locator('[data-analytics-accept]').click();
    await expect.poll(() => payloads.length).toBe(1);
    await page.addScriptTag({
      url: `${origin}/assets/js/analytics.js?v=consent-downloads-2`,
    });
    expect(tagLoads).toBe(1);
    expect(payloads).toEqual([
      {
        tid: 'G-TEST123456',
        en: 'page_view',
        dl: 'https://tiksavemp4.online/',
        dt: 'TikTok to MP4, MP3 & Image Downloader | TikSaveMP4',
        dr: expected,
      },
    ]);
    const commands = await page.evaluate(() =>
      (Reflect.get(window, 'dataLayer') as IArguments[]).map(
        (entry) => Array.from(entry) as unknown[],
      ),
    );
    expect(commands).toHaveLength(3);
    expect(JSON.stringify({ payloads, commands })).not.toMatch(
      /SECRET|ignore_referrer|session_start|"source"|"medium"|client_id|session_id|user_id/,
    );
  });
}

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
  await page.locator('[data-analytics-accept]').click();
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
  expect(commands.filter((command) => command[1] === 'page_view')).toHaveLength(1);
  expect(commands[2]).toEqual([
    'event',
    'page_view',
    {
      send_to: 'G-TEST123456',
      page_location: 'https://tiksavemp4.online/',
      page_title: 'TikTok to MP4, MP3 & Image Downloader | TikSaveMP4',
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
