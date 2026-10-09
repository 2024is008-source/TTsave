/// <reference lib="dom" />
import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

for (const saved of [null, 'dark', 'light', 'invalid'] as const) {
  test(`theme before first paint with saved ${String(saved)}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript((value) => {
      localStorage.clear();
      if (value !== null) localStorage.setItem('tiksavemp4-theme', value);
    }, saved);
    // Stop deferred application JS: the blocking head script must suffice.
    await page.route('**/assets/js/app.js?*', (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      saved === 'dark' ? 'dark' : 'light',
    );
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      saved === 'dark' ? '#0d101a' : '#f8faff',
    );
    const scriptBeforeCSS = await page.evaluate(() => {
      const script = document.querySelector('script[src="/assets/js/theme-init.js"]');
      const css = document.querySelector('link[rel="stylesheet"]');
      return (
        !!script &&
        !!css &&
        !!(script.compareDocumentPosition(css) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        !script.hasAttribute('defer') &&
        !script.hasAttribute('async')
      );
    });
    expect(scriptBeforeCSS).toBe(true);
  });
}
test('keyboard theme toggle persists and synchronizes browser color', async ({
  page,
}) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Switch to dark theme' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    '#0d101a',
  );
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Switch to light theme' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

for (const [width, height] of [
  [390, 844],
  [768, 1024],
  [1440, 1000],
] as const) {
  test(`photo gallery, security intents and visual states at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    const directory = 'docs/screenshots/command17/verified';
    await mkdir(directory, { recursive: true });
    const analysisId = '123e4567-e89b-42d3-a456-426614174000';
    const photoIds = [1, 2, 3].map(
      (id) => `123e4567-e89b-42d3-a456-42661417400${String(id)}`,
    );
    const capability = 'a'.repeat(43);
    const photos = photoIds.map((id, index) => ({
      id,
      position: index + 1,
      previewUrl: `/api/v1/analysis/${analysisId}/photos/${id}/preview?token=${capability}`,
    }));
    let fail = false;
    let finish: (() => void) | undefined;
    const releaseEvents = () => finish?.();
    let startDownload: (() => void) | undefined;
    const allowStart = () => startDownload?.();
    let chosen: unknown;
    let generation = 0;
    await page.route('**/api/v1/analyze', (route) => {
      generation++;
      return route.fulfill({
        json: {
          id: analysisId,
          postType: 'photo',
          title: `Public photo collection ${String(generation)}`,
          creator: 'Photo creator',
          thumbnail: null,
          durationSeconds: null,
          sourceUrl: 'https://www.tiktok.com/@creator/photo/123',
          formats: [],
          photos,
          capability,
          mock: false,
          downloadAvailable: true,
          capabilities: { images: true, mp4: false, mp3: false },
        },
      });
    });
    await page.route('**/photos/*/preview?*', (route) =>
      route.fulfill({
        path: 'public/assets/images/moment-nature.webp',
        contentType: 'image/webp',
      }),
    );
    const jobId = '123e4567-e89b-42d3-a456-426614174009';
    await page.route('**/api/v1/downloads', async (route) => {
      chosen = route.request().postDataJSON();
      await new Promise<void>((resolve) => {
        startDownload = resolve;
      });
      return route.fulfill({
        json: {
          id: jobId,
          analysisId,
          formatId: photoIds[1],
          downloadType: 'image',
          status: 'queued',
          mock: false,
          accessToken: 'b'.repeat(43),
        },
      });
    });
    await page.route('**/api/v1/downloads/*/events', async (route) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      const job = {
        id: jobId,
        analysisId,
        formatId: photoIds[1],
        downloadType: 'image',
        mock: false,
        ...(fail
          ? {
              status: 'error',
              error: {
                code: 'IMAGE_UNAVAILABLE',
                message:
                  'The image could not be downloaded. Please select another image or try again.',
                retryable: true,
                fieldErrors: {},
                requestId: jobId,
              },
            }
          : {
              status: 'ready',
              fileUrl: `/api/v1/downloads/${jobId}/file?token=${'c'.repeat(43)}`,
              fileExpiresAt: Date.now() + 60000,
              progress: { sizeBytes: 2048 },
            }),
      };
      await route.fulfill({
        contentType: 'text/event-stream',
        body: `event: job\ndata: ${JSON.stringify(job)}\n\n`,
      });
    });
    await page.route('**/api/v1/downloads/*', (route) => route.fulfill({ json: {} }));
    const capture = async (name: string) => {
      const panel =
        name === 'preparing'
          ? '#progress-card'
          : name === 'completed'
            ? '#completed-card'
            : name === 'error'
              ? '#error-card'
              : '#result-card';
      if (panel === '#result-card') await page.locator(panel).scrollIntoViewIfNeeded();
      else
        await page
          .locator(panel)
          .evaluate((element) =>
            element.scrollIntoView({ block: 'center', behavior: 'instant' }),
          );
      await page.screenshot({
        path: `${directory}/${String(width)}-${name}.png`,
        fullPage: false,
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      expect(
        await page
          .locator('#photo-gallery')
          .evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
      ).toBe(true);
    };
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({
      path: `${directory}/${String(width)}-first-visit-light.png`,
    });
    await page.locator('#video-url').fill('https://www.tiktok.com/@creator/photo/123');
    await page.getByRole('button', { name: 'Get video', exact: true }).click();
    await expect(page.locator('#photo-position')).toHaveText('1 of 3');
    await expect
      .poll(() =>
        page
          .locator('#photo-selected')
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(page.locator('#quality-card')).toBeHidden();
    await capture('first');
    await page.locator('#result-card').screenshot({
      path: `${directory}/${String(width)}-gallery-full.png`,
      style: 'header, .skip-link {visibility:hidden!important;}',
    });
    await page.getByRole('button', { name: 'Select image 2' }).click();
    await expect(page.locator('#photo-position')).toHaveText('2 of 3');
    await capture('middle');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('#photo-position')).toHaveText('3 of 3');
    await capture('last');
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await page.locator('#photo-gallery').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#photo-position')).toHaveText('1 of 3');
    await page.keyboard.press('ArrowRight');
    await page.getByRole('button', { name: 'Download image', exact: true }).click();
    await expect.poll(() => startDownload !== undefined).toBe(true);
    await expect(page.locator('#progress-title')).toHaveText('Preparing image…');
    expect(chosen).toEqual({
      analysisId,
      photoId: photoIds[1],
      downloadType: 'image',
      capability,
    });
    await capture('preparing');
    allowStart();
    await expect.poll(() => finish !== undefined).toBe(true);
    releaseEvents();
    await expect(page.locator('#completed-title')).toHaveText('Your image is ready');
    await capture('completed');
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await capture('dark');
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await page.getByRole('button', { name: 'Select image 2' }).click();
    await expect(page.locator('#photo-position')).toHaveText('2 of 3');
    await expect(page.locator('#photo-download')).toBeVisible();
    await page.locator('#photo-another').click();
    await expect(page.locator('#photo-thumbnails button')).toHaveCount(0);
    await page.locator('#video-url').fill('https://www.tiktok.com/@creator/photo/456');
    await page.getByRole('button', { name: 'Get video', exact: true }).click();
    await expect(page.locator('#result-title')).toHaveText('Public photo collection 2');
    await expect(page.locator('#photo-position')).toHaveText('1 of 3');
    await page.getByRole('button', { name: 'Select image 2' }).click();
    fail = true;
    finish = undefined;
    startDownload = undefined;
    await page.locator('#photo-download').click();
    await expect.poll(() => startDownload !== undefined).toBe(true);
    allowStart();
    await expect.poll(() => finish !== undefined).toBe(true);
    releaseEvents();
    await expect(page.locator('#error-card')).toBeVisible();
    await capture('error');
    await page.locator('.choose-button').click();
    await expect(page.locator('#photo-position')).toHaveText('2 of 3');
    const image = await page.locator('#photo-selected').evaluate((element) => {
      const image = element as HTMLImageElement;
      return {
        width: image.clientWidth,
        height: image.clientHeight,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      };
    });
    // Image element may be capped; object-fit contains the full natural image.
    expect(image.width).toBeLessThanOrEqual(width);
    await expect(page.locator('#photo-selected')).toHaveCSS('object-fit', 'contain');
    await page.getByRole('button', { name: 'Select image 3' }).click();
    await page.locator('#photo-selected').dispatchEvent('error');
    await expect(page.locator('#photo-unavailable')).toBeVisible();
    await expect(page.locator('#photo-download')).toBeEnabled();
    await page.getByRole('button', { name: 'Select image 1' }).click();
    await expect(page.locator('#photo-unavailable')).toBeHidden();
    await expect(page.locator('#photo-selected')).toBeVisible();
  });
}
