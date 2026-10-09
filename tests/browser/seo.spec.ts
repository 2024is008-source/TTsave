/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

for (const width of [390, 768, 1024, 1440, 1920]) {
  test(`SEO copy remains readable and interactive at ${String(width)}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'TikTok to MP4 Downloader',
    );
    for (const selector of [
      '#hero-title',
      '#download-form',
      '#features-title',
      '#steps-title',
      '#moments-title',
      '#faq-title',
      '.cta-copy',
    ]) {
      const element = page.locator(selector);
      const bounds = await element.boundingBox();
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
      expect(
        await element.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      ).toBe(true);
    }
    const question = page
      .locator('summary')
      .filter({ hasText: 'Can I download TikTok audio as MP3?' });
    await question.click();
    await expect(question.locator('..').locator('p')).toBeVisible();
    await question.focus();
    await page.keyboard.press('Enter');
    await expect(question.locator('..').locator('p')).toBeHidden();
    if (width <= 800) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.locator('#mobile-nav')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#mobile-nav')).toBeHidden();
    }
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`seo-${String(width)}.png`),
      fullPage: true,
    });
    await page.goto('/not-a-real-page');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Return to the TikSaveMp4 downloader' }).click();
    await expect(page.locator('#download-form')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
