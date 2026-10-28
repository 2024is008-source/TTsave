/// <reference lib="dom" />
import { expect, test } from '@playwright/test';
import { reservePublicBudget } from './public-budget.js';
import { blogPosts } from '../../src/data/blog-posts.js';
import { legalPages } from '../../src/data/legal-pages.js';

test.beforeEach(async ({ request }, info) => {
  await reservePublicBudget(request, info);
});

const paths = [
  '/',
  '/blog',
  ...legalPages.map((page) => page.path),
  ...blogPosts
    .filter((post) => post.status === 'published')
    .map((post) => '/blog/' + post.slug),
];
for (const width of [320, 375, 390, 768, 1024, 1440]) {
  test(`every published page fits ${String(width)}px without changing its design`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const findings: unknown[] = [];
    for (const path of paths) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toBeVisible();
      const layout = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(layout.document, path).toBeLessThanOrEqual(layout.viewport);
      findings.push({ path, ...layout });
      if (path === '/')
        await testInfo.attach('home-' + String(width), {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
    }
    await testInfo.attach('all-page-widths', {
      body: Buffer.from(JSON.stringify(findings, null, 2)),
      contentType: 'application/json',
    });
  });
}
