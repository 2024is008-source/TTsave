/// <reference lib="dom" />
import { once } from 'node:events';
import type { Server } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { advertisingFixture } from '../helpers/advertising.js';

let server: Server;
let origin: string;
const original = { ...env };
const fixture = advertisingFixture();
test.beforeAll(async () => {
  env.ADVERTISING_ENABLED = true;
  env.MONETAG_IPP_ENABLED = true;
  env.MONETAG_VIGNETTE_ENABLED = true;
  env.MONETAG_IPP_TAG_FILE = fixture.manifest('in-page-push');
  env.MONETAG_VIGNETTE_TAG_FILE = fixture.manifest('vignette-banner');
  env.MONETAG_MOBILE_ENABLED = false;
  env.GA_MEASUREMENT_ID = undefined;
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Missing fixture address');
  origin = `http://127.0.0.1:${String(address.port)}`;
});
test.afterAll(async () => {
  Object.assign(env, original);
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  fixture.cleanup();
});
test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', (route) => route.abort());
});
const grant = async (page: import('@playwright/test').Page) => {
  await page.evaluate(() => {
    const api = Reflect.get(window, 'tikSaveAdvertising') as {
      setConsent: (value: boolean) => void;
    };
    api.setConsent(true);
  });
};

test('no provider bytes or layout shift before consent, then each inert fixture loads once', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/advertising/tags/')) requests.push(request.url());
  });
  await page.goto(origin + '/blog');
  const before = await page.locator('main').boundingBox();
  expect(requests).toHaveLength(0);
  await grant(page);
  await expect(page.locator('html')).toHaveAttribute('data-fixture-ipp', 'loaded', {
    timeout: 7000,
  });
  await expect(page.locator('html')).toHaveAttribute('data-fixture-vignette', 'loaded');
  await grant(page);
  await page.addScriptTag({ url: origin + '/assets/js/advertising.js?v=duplicate-test' });
  expect(requests).toHaveLength(2);
  expect(new Set(requests).size).toBe(2);
  expect(await page.locator('main').boundingBox()).toEqual(before);
  await expect(page.locator('body script[data-ttsave-ad-format]')).toHaveCount(0);
  const bytes = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.includes('/assets/js/advertising.js'))
      .map((entry) => (entry as PerformanceResourceTiming).decodedBodySize),
  );
  expect(bytes.every((value) => value < 12000)).toBe(true);
  await testInfo.attach('inert-ad-fixture-editorial-page', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

for (const width of [390, 1280]) {
  test(`homepage stays responsive and providers remain outside the downloader at ${String(width)}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/advertising/tags/')) requests.push(request.url());
    });
    await page.goto(origin);
    await grant(page);
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 3300)));
    expect(requests).toHaveLength(0);
    await expect(page.locator('#video-url')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await mkdir('docs/screenshots/advertising', { recursive: true });
    const screenshot = await page.screenshot({
      path: `docs/screenshots/advertising/home-${String(width)}.png`,
    });
    await testInfo.attach(`unchanged-home-${String(width)}`, {
      body: screenshot,
      contentType: 'image/png',
    });
  });
}

test('mobile menu remains operable and no ads start while it is open', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/blog');
  await grant(page);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.locator('#mobile-nav')).toBeVisible();
  await expect(page.locator('.menu-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 3300)));
  await expect(page.locator('script[data-ttsave-ad-format]')).toHaveCount(0);
});

test('downloader input and errors remain usable without starting provider code', async ({
  page,
}) => {
  await page.goto(origin);
  await grant(page);
  await page.route('**/api/v1/analyze', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'INVALID_URL',
          message: 'Inert fixture error',
          retryable: false,
          fieldErrors: {},
          requestId: 'fixture',
        },
      }),
    }),
  );
  await page.locator('#video-url').fill('https://www.tiktok.com/@fixture/video/123');
  await page.locator('.analyze-button').click();
  await expect(page.locator('#error-card')).toBeVisible();
  await expect(page.locator('#video-url')).toBeEnabled();
  await page.locator('#features').scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 3300)));
  await expect(page.locator('script[data-ttsave-ad-format]')).toHaveCount(0);
});

test('home can load reviewed tags only after consent and scrolling beyond its idle downloader', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(origin);
  await grant(page);
  await page.locator('#faq').scrollIntoViewIfNeeded();
  expect(
    await page
      .locator('#hero')
      .evaluate((element) => element.getBoundingClientRect().bottom),
  ).toBeLessThanOrEqual(0);
  await expect(page.locator('html')).toHaveAttribute('data-fixture-ipp', 'loaded', {
    timeout: 7000,
  });
  await expect(page.locator('html')).toHaveAttribute('data-fixture-vignette', 'loaded');
});
