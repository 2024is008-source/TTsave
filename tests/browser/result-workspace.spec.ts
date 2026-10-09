/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

for (const [width, height] of [
  [390, 844],
  [768, 1024],
  [1024, 900],
  [1440, 1000],
]) {
  test(`connected result at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width: width ?? 390, height: height ?? 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const id = '123e4567-e89b-42d3-a456-426614174000';
    const thumbnail = `/api/v1/analysis/${id}/thumbnail?token=${'a'.repeat(43)}`;
    await page.route(`**${thumbnail}`, (route) =>
      route.fulfill({
        path: 'public/assets/images/hero-video-poster.webp',
        contentType: 'image/webp',
      }),
    );
    let fail = false;
    await page.route('**/api/v1/analyze', (route) =>
      fail
        ? route.fulfill({
            status: 422,
            json: {
              error: {
                code: 'VIDEO_UNAVAILABLE',
                message: 'Video unavailable',
                retryable: false,
                fieldErrors: {},
                requestId: id,
              },
            },
          })
        : route.fulfill({
            json: {
              id,
              title: 'An evening by the coast — a moment worth keeping',
              creator: 'Travel creator',
              thumbnail,
              durationSeconds: 24,
              sourceUrl: 'https://www.tiktok.com/@test/video/123',
              mock: false,
              downloadAvailable: true,
              formats: [1080, 720, 576, 360, 240].map((resolution, index) => ({
                id: `source-${String(index + 1)}`,
                container: 'mp4',
                width: resolution,
                height: Math.round((resolution * 16) / 9),
                qualityLabel: `${String(resolution)}p`,
                hasAudio: true,
                compatibility: 'broad',
              })),
            },
          }),
    );
    await page.goto('/');
    if ((width ?? 390) >= 1024) await expect(page.locator('.hero-art')).toBeVisible();
    else await expect(page.locator('.hero-art')).toBeHidden();
    await page.locator('#video-url').fill('https://www.tiktok.com/@test/video/123');
    await page.getByRole('button', { name: 'Get video' }).click();
    await expect(page.locator('#result-title')).toBeFocused();
    if ((width ?? 390) >= 1024) await expect(page.locator('.hero-art')).toBeVisible();
    else await expect(page.locator('.hero-art')).toBeHidden();
    await expect(page.locator('.hero h1')).toBeVisible();
    await expect(page.locator('.result-phone')).toBeHidden();
    await expect(page.locator('.phone:visible')).toHaveCount(
      (width ?? 390) >= 1024 ? 1 : 0,
    );
    await expect(page.locator('#result-thumbnail')).toHaveAttribute('src', thumbnail);
    await expect
      .poll(() =>
        page
          .locator('#result-thumbnail')
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(page.locator('#result-creator')).toHaveText('Travel creator');
    await expect(page.locator('#preview-unavailable')).toBeHidden();
    await expect(page.locator('#format-options label')).toHaveCount(4);
    await expect(
      page.getByRole('button', { name: 'Download MP4', exact: true }),
    ).toBeEnabled();
    const choices = await page.locator('#format-options').boundingBox();
    const primary = await page.locator('.download-button').boundingBox();
    if (!choices || !primary) throw new Error('Missing quality controls');
    expect(choices.y + choices.height).toBeLessThanOrEqual(primary.y);
    const heading = await page.locator('#result-title').boundingBox();
    expect(heading?.height).toBeGreaterThanOrEqual(18);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const panel = await page.locator('.result-panel').boundingBox();
    if (!panel) throw new Error('Missing result panel');
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(width ?? 390);
    await page.locator('#video-url').focus();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: `docs/screenshots/mp3-regression-ready-${String(width)}-viewport.png`,
    });
    await page.locator('.hero').screenshot({
      path: `docs/screenshots/mp3-regression-ready-${String(width)}.png`,
      style: '.site-header, .skip-link { visibility: hidden !important; }',
    });
    if (width === 390)
      await page
        .locator('.hero')
        .screenshot({ path: 'docs/screenshots/mp3-regression-state-mobile-ready.png' });
    await page.locator('#more-formats summary').click();
    await page
      .locator('.format-option')
      .filter({ has: page.locator('#format-4') })
      .click();
    await expect(page.locator('#format-4')).toBeChecked();
    await page
      .locator('#result-thumbnail')
      .evaluate((image) => image.dispatchEvent(new Event('error')));
    await expect(page.locator('#preview-unavailable')).toHaveJSProperty('hidden', false);
    fail = true;
    await page.locator('#video-url').fill('https://www.tiktok.com/@second/video/456');
    await expect(page.locator('#result-card')).toBeHidden();
    await expect(page.locator('#result-creator')).toBeEmpty();
    await page.getByRole('button', { name: 'Get video' }).click();
    await expect(page.locator('#form-status')).toHaveText('Video unavailable');
    await expect(page.locator('#form-status')).toBeFocused();
    if ((width ?? 390) >= 1024) await expect(page.locator('.hero-art')).toBeVisible();
    else await expect(page.locator('.hero-art')).toBeHidden();
    await expect(page.locator('#video-url')).toHaveValue(
      'https://www.tiktok.com/@second/video/456',
    );
  });
}
