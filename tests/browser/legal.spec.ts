/// <reference lib="dom" />
import { screenshotRoot } from './evidence.js';
import { test, expect } from '@playwright/test';

for (const width of [390, 768, 1440]) {
  test(`legal pages are readable and navigable at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    for (const path of [
      '/privacy',
      '/terms',
      '/responsible-use',
      '/copyright',
      '/contact',
    ]) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      expect(
        await page
          .locator('.legal-page p')
          .first()
          .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
      ).toBeGreaterThanOrEqual(16);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://tiksavemp4.online${path}`,
      );
    }
    await page.goto('/privacy');
    await page.screenshot({
      path: `${screenshotRoot}/mp3-regression-privacy-${String(width)}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({
      path: `${screenshotRoot}/mp3-regression-privacy-dark-${String(width)}.png`,
      fullPage: true,
    });
    await page.locator('.footer-nav a[href="/#downloader"]').click();
    await expect(page.locator('#video-url')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
