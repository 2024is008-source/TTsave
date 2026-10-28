import { expect, test } from '@playwright/test';

for (const width of [390, 1440]) {
  for (const dpr of [1, 2]) {
    test(`responsive owned images at ${String(width)}px DPR ${String(dpr)}`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        deviceScaleFactor: dpr,
      });
      const page = await context.newPage();
      const requests: string[] = [];
      page.on('request', (req) => requests.push(new URL(req.url()).pathname));
      try {
        await page.goto('http://127.0.0.1:3100/');
        await page.waitForLoadState('networkidle');
        expect(
          requests.filter((path) => /hero-video-poster|hero-avatar|showcase-/.test(path)),
        ).toEqual([]);
        await expect(page.locator('.hero-art, .phone-scene')).toHaveCount(0);
        const cover = page.locator('.blog-preview .blog-card img').first();
        await cover.scrollIntoViewIfNeeded();
        await cover.evaluate((img) => (img as HTMLImageElement).decode());
        expect(
          await cover.evaluate((img) => (img as HTMLImageElement).currentSrc),
        ).toMatch(dpr === 1 ? /-400\.webp$/ : /-800\.webp$/);
        const box = await cover.boundingBox();
        expect(box?.width).toBeGreaterThan(300);
        await page.getByRole('button', { name: 'Switch to dark theme' }).click();
        await expect(cover).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      } finally {
        await context.close();
      }
    });
  }
}
