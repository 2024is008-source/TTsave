/// <reference lib="dom" />
import { screenshotRoot } from './evidence.js';
import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

for (const [width, height] of [
  [390, 844],
  [768, 1024],
  [1440, 1000],
] as const) {
  test(`selected photo archive at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const directory = `${screenshotRoot}/photo-selection`;
    await mkdir(directory, { recursive: true });
    const id = '123e4567-e89b-42d3-a456-426614174000';
    const capability = 'a'.repeat(43);
    const ids = [1, 2, 3, 4].map(
      (n) => `123e4567-e89b-42d3-a456-42661417400${String(n)}`,
    );
    let unsupported = false;
    let fail = false;
    let release: (() => void) | undefined;
    const allowRelease = () => release?.();
    let intent: unknown;
    await page.route('**/api/v1/analyze', (route) =>
      unsupported
        ? route.fulfill({
            status: 422,
            json: {
              error: {
                code: 'UNSUPPORTED_PHOTO',
                message: 'This photo post is not supported.',
                retryable: false,
                fieldErrors: {},
                requestId: id,
              },
            },
          })
        : route.fulfill({
            json: {
              id,
              postType: 'photo',
              title: 'Public photo selection fixture',
              creator: 'Photo creator',
              sourceUrl: 'https://www.tiktok.com/@creator/photo/123',
              mock: false,
              thumbnail: null,
              durationSeconds: null,
              formats: [],
              capability,
              downloadAvailable: true,
              capabilities: { images: true, mp4: false, mp3: false },
              photos: ids.map((photoId, index) => ({
                id: photoId,
                position: index + 1,
                previewUrl: `/api/v1/analysis/${id}/photos/${photoId}/preview?token=${capability}`,
              })),
            },
          }),
    );
    await page.route('**/photos/*/preview?*', (route) =>
      route.fulfill({
        path: 'public/assets/images/moment-nature.webp',
        contentType: 'image/webp',
      }),
    );
    await page.route('**/api/v1/downloads', async (route) => {
      intent = route.request().postDataJSON();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      if (fail)
        return route.fulfill({
          status: 502,
          json: {
            error: {
              code: 'IMAGE_UNAVAILABLE',
              message: 'One or more images could not be retrieved.',
              retryable: true,
              fieldErrors: {},
              requestId: id,
            },
          },
        });
      return route.fulfill({
        json: {
          id,
          analysisId: id,
          formatId: ids[0],
          downloadType: 'image',
          photoCount: 2,
          status: 'queued',
          mock: false,
          accessToken: 'b'.repeat(43),
        },
      });
    });
    await page.route('**/api/v1/downloads/*/events', (route) =>
      route.fulfill({
        contentType: 'text/event-stream',
        body: `event: job\ndata: ${JSON.stringify({ id, analysisId: id, formatId: ids[0], downloadType: 'image', photoCount: 2, status: 'ready', mock: false, fileUrl: `/api/v1/downloads/${id}/file?token=${'c'.repeat(43)}`, fileExpiresAt: Date.now() + 60000 })}\n\n`,
      }),
    );
    await page.route('**/api/v1/downloads/*', (route) => route.fulfill({ json: {} }));
    const capture = async (name: string) => {
      await page.mouse.move(0, 0);
      await page.evaluate(async () => {
        (document.activeElement as HTMLElement).blur();
        scrollTo({ top: 0, behavior: 'instant' });
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      });
      await page.screenshot({
        path: `${directory}/${String(width)}-${name}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      expect(
        await page
          .locator('#result-card')
          .evaluate((node) => node.scrollHeight <= node.clientHeight + 1),
      ).toBe(true);
    };
    await page.goto('/');
    await capture('idle');
    await page.locator('#video-url').fill('https://www.tiktok.com/@creator/photo/123');
    await page.getByRole('button', { name: 'Get video', exact: true }).click();
    await expect(page.locator('#photo-position')).toHaveText('1 of 4');
    await page.locator('#photo-multi summary').click();
    await expect(page.locator('#photo-download-selected')).toBeDisabled();
    await capture('photo-ready');
    await page.locator('#photo-select-all').click();
    await expect(page.locator('#photo-selection-count')).toHaveText('4 of 4 selected');
    await page.locator('#photo-clear-selection').click();
    await expect(page.locator('#photo-selection-count')).toHaveText('0 of 4 selected');
    const first = page.getByRole('checkbox', { name: 'Save photo 1', exact: true });
    await first.focus();
    await page.keyboard.press('Space');
    await page.getByRole('checkbox', { name: 'Save photo 3', exact: true }).check();
    await expect(page.locator('#photo-selection-count')).toHaveText('2 of 4 selected');
    await capture('multiple-selected');
    const scan = await new AxeBuilder({ page })
      .include('#result-card')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
    await page.locator('#photo-download-selected').click();
    await expect(page.locator('#progress-title')).toHaveText('Preparing your images…');
    await expect.poll(() => release !== undefined).toBe(true);
    expect(intent).toEqual({
      analysisId: id,
      photoIds: [ids[0], ids[2]],
      downloadType: 'image',
      capability,
    });
    await capture('preparing');
    allowRelease();
    await expect(page.locator('#completed-title')).toHaveText(
      'Your selected images are ready',
    );
    await capture('completed');
    await page.getByRole('button', { name: 'Select image 2', exact: true }).click();
    fail = true;
    release = undefined;
    await page.locator('#photo-download-selected').click();
    await expect.poll(() => release !== undefined).toBe(true);
    allowRelease();
    await expect(page.locator('#error-card')).toBeVisible();
    await capture('error');
    await page.locator('.choose-button').click();
    await page.locator('#photo-another').click();
    unsupported = true;
    await page.locator('#video-url').fill('https://www.tiktok.com/@creator/photo/456');
    await page.getByRole('button', { name: 'Get video', exact: true }).click();
    await expect(page.locator('#error-card')).toContainText(
      'This photo post is not supported.',
    );
    await capture('unsupported');
    await expect(page.locator('#photo-selection-list input')).toHaveCount(0);
  });
}
