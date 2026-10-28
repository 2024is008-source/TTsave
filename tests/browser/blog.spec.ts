/// <reference lib="dom" />
import { once } from 'node:events';
import type { Server } from 'node:http';
import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { createApp } from '../../src/app.js';
import { fixturePost } from '../fixtures/blog.js';

let server: Server;
let origin: string;
test.beforeAll(async () => {
  server = createApp(undefined, () => true, [
    fixturePost(),
    fixturePost('unpublished', { status: 'draft' }),
  ]).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing fixture server address');
  origin = `http://127.0.0.1:${String(address.port)}`;
});
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

for (const width of [390, 768, 850, 1024, 1440]) {
  test(`blog listing navigation, themes and accessibility at ${String(width)}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    const downloaderRequests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.url().includes('/assets/js/downloader.js'))
        downloaderRequests.push(request.url());
    });
    await page.goto('/');
    downloaderRequests.length = 0;
    if (width < 1024) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.locator('#mobile-nav a[href="/blog"]').click();
    } else await page.locator('.desktop-nav a[href="/blog"]').click();
    await expect(page).toHaveURL(/\/blog$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'TikTok Download Guides & Tutorials',
    );
    await expect(page.locator('.blog-card')).toHaveCount(4);
    // The fourth card is below the initial viewport; exercise its lazy-loaded cover.
    for (const image of await page.locator('.blog-card img').all()) {
      await image.scrollIntoViewIfNeeded();
      await expect(image).toHaveJSProperty('complete', true);
      await expect
        .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    }
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expect(page.locator('.blog-card h3 a')).toHaveText([
      'How to Convert TikTok to MP4 Online: A Simple Step-by-Step Guide',
      'How to Convert TikTok to MP3 Online: The Full Guide',
      'How to Download TikTok Images Online: A Step-by-Step Guide',
      'How to Download TikTok Videos on PC: Step-by-Step Tutorial',
    ]);
    await expect(page.locator('.blog-card h3 a').first()).toHaveAttribute(
      'href',
      '/blog/how-to-convert-tiktok-to-mp4',
    );
    await expect(page.locator('#blog-empty-title')).toHaveCount(0);
    await expect(page.locator('.desktop-nav a[href="/blog"]')).toHaveClass('nav-active');
    const headerBounds = await page.locator('.header-inner').boundingBox();
    expect(headerBounds).not.toBeNull();
    for (const selector of ['.wordmark', '.header-actions']) {
      const bounds = await page
        .locator('.site-header ' + selector)
        .first()
        .boundingBox();
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
    }
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark')
        await page.getByRole('button', { name: 'Switch to dark theme' }).click();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      const accessibility = await new AxeBuilder({ page }).analyze();
      expect(accessibility.violations).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`blog-${String(width)}-${theme}.png`),
        fullPage: true,
      });
    }
    expect(downloaderRequests).toEqual([]);
    expect(errors).toEqual([]);
    await expect(page.locator('.site-footer a[href="/blog"]')).toHaveCount(1);
    await page.locator('.site-footer a[href="/#how-it-works"]').click();
    await expect(page.locator('#download-form')).toBeAttached();
  });
}

for (const width of [390, 1440]) {
  test(`fixture article renders safely with both themes at ${String(width)}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const loaded: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/assets/js/downloader.js')) loaded.push(request.url());
    });
    await page.goto(origin + '/blog');
    await expect(page.locator('.blog-card')).toHaveCount(1);
    await page
      .getByRole('link', { name: 'Fixture test-video-guide', exact: true })
      .click();
    await expect(page.locator('.blog-prose')).toBeVisible();
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark')
        await page.getByRole('button', { name: 'Switch to dark theme' }).click();
      // Inspect the settled theme, after the shared header's color transition.
      await page.evaluate(async () => {
        await Promise.all(
          document
            .querySelector('.site-header')
            ?.getAnimations()
            .map((animation) => animation.finished) ?? [],
        );
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`fixture-article-${String(width)}-${theme}.png`),
        fullPage: true,
      });
    }
    expect(loaded).toEqual([]);
    const response = await page.goto(origin + '/blog/unpublished');
    expect(response?.status()).toBe(404);
  });
}

test('published fixture body is readable with JavaScript disabled', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(origin + '/blog/test-video-guide');
  await expect(page.getByRole('heading', { name: 'First step' })).toBeVisible();
  await expect(page.locator('.blog-prose li')).toHaveText('Test instruction.');
  await context.close();
});
