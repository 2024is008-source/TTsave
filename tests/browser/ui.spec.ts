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
    // Idle marketing decorations are preserved. Check the input workspace here;
    // result tests check document-wide overflow after the artwork transforms.
    const inputBounds = await page.locator('#download-form').boundingBox();
    expect(inputBounds?.x).toBeGreaterThanOrEqual(0);
    expect((inputBounds?.x ?? 0) + (inputBounds?.width ?? 0)).toBeLessThanOrEqual(width);
    const imageLoaded = await page
      .locator('.phone-scene img')
      .evaluate((image) => (image as HTMLImageElement).naturalWidth > 0);
    expect(imageLoaded).toBe(true);
    const pictures = page.locator('picture');
    await expect(pictures).toHaveCount(7);
    for (const picture of await pictures.all()) {
      const image = picture.locator('img');
      if (await image.isVisible()) {
        await image.scrollIntoViewIfNeeded();
        await expect(image).toHaveJSProperty('complete', true);
        await expect
          .poll(async () =>
            image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
      }
      await expect(image).toHaveAttribute('src', /^\/assets\/images\/.*\.webp$/);
      await expect(image).toHaveAttribute('width', /^\d+$/);
      await expect(image).toHaveAttribute('height', /^\d+$/);
      await expect(picture.locator('source')).toHaveAttribute(
        'srcset',
        /\.webp \d+w, .*\.webp \d+w/,
      );
    }
    await expect(page.locator('.art-sphere')).toHaveCount(3);
    await expect(page.locator('.feature-card')).toHaveCount(4);
    await expect(page.locator('.step-card')).toHaveCount(3);
    await expect(page.locator('.moment-card')).toHaveCount(3);
    await expect(page.locator('.showcase-decoration')).toHaveCSS(
      'pointer-events',
      'none',
    );
    for (const card of await page
      .locator('.landing-showcase article, .step-card')
      .all()) {
      const bounds = await card.boundingBox();
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
    }
    await page.locator('.landing-showcase').screenshot({
      path: `docs/screenshots/showcase-light-${String(width)}.png`,
      style: '.site-header, .skip-link { visibility: hidden !important; }',
    });
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
      .filter({ hasText: 'Which TikTok links are supported?' })
      .click();
    await expect(
      page.getByText('TTSave supports publicly accessible TikTok video links only', {
        exact: false,
      }),
    ).toBeVisible();
    await page.locator('#video-url').fill('https://example.com/video/123');
    await page.getByRole('button', { name: 'Get video' }).click();
    await expect(page.locator('#form-status')).toHaveText(
      'Enter a public TikTok video link using HTTPS.',
    );
    await expect(page.locator('#video-url')).toBeFocused();
    await page.locator('#video-url').fill('https://www.tiktok.com/@test/video/123');
    // Browser automation never contacts live TikTok. Exercise the API response contract.
    await page.route('**/api/v1/analyze', (route) =>
      route.fulfill({
        json: {
          id: '123e4567-e89b-42d3-a456-426614174000',
          title: 'Test source video',
          creator: 'Test creator',
          thumbnail: null,
          durationSeconds: 12,
          sourceUrl: 'https://www.tiktok.com/@test/video/123',
          mock: false,
          downloadAvailable: false,
          formats: [
            {
              id: 'source-1',
              container: 'mp4',
              qualityLabel: '720 × 1280 source pixels',
              width: 720,
              height: 1280,
              hasAudio: true,
            },
          ],
        },
      }),
    );
    await page.getByRole('button', { name: 'Get video' }).click();
    await expect(page.locator('#result-title')).toHaveText('Test source video');
    await expect(
      page.getByRole('radio', { name: /720 × 1280 source pixels/ }),
    ).toBeChecked();
    await expect(
      page.getByRole('button', { name: 'Download unavailable' }),
    ).toBeDisabled();
    await expect(page.locator('#result-card')).toBeVisible();
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
    await expect(page.locator('#result-card')).toBeHidden();
    if (width >= 1024) await expect(page.locator('.hero-art')).toBeVisible();
    else await expect(page.locator('.hero-art')).toBeHidden();
    await page.evaluate(() => {
      (document.activeElement as HTMLElement).blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: testInfo.outputPath(`dark-${String(width)}.png`),
      fullPage: true,
    });
    await page.locator('.landing-showcase').screenshot({
      path: `docs/screenshots/showcase-dark-${String(width)}.png`,
      style: '.site-header, .skip-link { visibility: hidden !important; }',
    });
    expect(browserErrors).toEqual([]);
  });
}
