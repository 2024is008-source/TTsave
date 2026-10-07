/// <reference lib="dom" />

import { expect, test } from '@playwright/test';

for (const width of [390, 768, 1024, 1440]) {
  test(`layout and interactions at ${String(width)}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    const browserErrors: string[] = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('#video-url')).toHaveValue('');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const imageLoaded = await page
      .locator('.phone-scene img')
      .evaluate((image) => (image as HTMLImageElement).naturalWidth > 0);
    expect(imageLoaded).toBe(true);
    const pictures = page.locator('picture');
    await expect(pictures).toHaveCount(8);
    for (const picture of await pictures.all()) {
      const image = picture.locator('img');
      await image.scrollIntoViewIfNeeded();
      await expect(image).toHaveJSProperty('complete', true);
      await expect
        .poll(async () =>
          image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
      await expect(image).toHaveAttribute('src', /^\/assets\/images\/.*\.webp$/);
      await expect(image).toHaveAttribute('width', /^\d+$/);
      await expect(image).toHaveAttribute('height', /^\d+$/);
      await expect(picture.locator('source')).toHaveAttribute(
        'srcset',
        /\.webp \d+w, .*\.webp \d+w/,
      );
    }
    await expect(page.locator('.art-sphere')).toHaveCount(2);
    await expect(
      page.locator('.social-actions button, .floating-artwork button'),
    ).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`light-${String(width)}.png`),
      fullPage: true,
    });

    if (width <= 800) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.locator('#mobile-nav')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#mobile-nav')).toBeHidden();
    }

    await page
      .locator('summary')
      .filter({ hasText: 'Can I download a video right now?' })
      .click();
    await expect(
      page.getByText('Not yet. This interface is a preview.', { exact: false }),
    ).toBeVisible();
    await page.locator('#video-url').fill('https://example.com/video/123');
    await page.getByRole('button', { name: 'Check link' }).click();
    await expect(page.locator('#form-status')).toHaveText(
      'Enter a public TikTok video link using HTTPS.',
    );
    await expect(page.locator('#video-url')).toBeFocused();
    await page.locator('#video-url').fill('https://www.tiktok.com/@test/video/123');
    await page.getByRole('button', { name: 'Check link' }).click();
    await expect(page.locator('#result-title')).toHaveText(
      'Mock API preview — not analyzed TikTok content',
    );
    await expect(
      page.getByRole('radio', { name: 'Mock format — file unavailable' }),
    ).toBeChecked();
    await page.getByRole('button', { name: 'Request download', exact: true }).click();
    await expect(page.locator('#form-status')).toContainText(
      'The mock service does not produce video files.',
    );
    await expect(page.locator('.result-card')).toBeHidden();
    await expect(page.locator('.progress-card')).toBeHidden();
    await expect(page.locator('#video-url')).toHaveValue(
      'https://www.tiktok.com/@test/video/123',
    );
    if (width <= 800) {
      expect(
        await page
          .locator('#video-url')
          .evaluate((input) => getComputedStyle(input).fontSize),
      ).toBe('16px');
    }

    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => {
      (document.activeElement as HTMLElement).blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: testInfo.outputPath(`dark-${String(width)}.png`),
      fullPage: true,
    });
    expect(browserErrors).toEqual([]);
  });
}
