/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`glass fetching and source panel at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    await page.goto('/');
    await page.evaluate(async () => {
      const modulePath = '/assets/js/downloader.js';
      const module = (await import(
        modulePath
      )) as typeof import('../../src/frontend/downloader.js');
      module.initializeDownloader(document, {
        adapter: {
          analyze: (_url, signal) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener('abort', () => reject(new Error('Cancelled')), {
                once: true,
              });
            }),
          startDownload: () => Promise.reject(new Error('Unused')),
          waitForDownload: () => Promise.reject(new Error('Unused')),
        },
      });
    });
    await page.locator('#video-url').fill('https://www.tiktok.com/@test/video/123');
    await page.getByRole('button', { name: 'Get video' }).click();
    await expect(page.locator('#analyzing-indicator')).toBeVisible();
    await expect(page.locator('#analyzing-indicator')).toContainText(
      'Fetching video info',
    );
    await expect(page.locator('.analyzing-spinner')).toHaveCSS('animation-name', 'none');
    await page
      .locator('#analyzing-indicator')
      .screenshot({ path: `docs/screenshots/fetching-panel-${String(width)}.png` });
    await page.getByRole('button', { name: 'Cancel analysis' }).click();
    await expect(page.locator('#analyzing-indicator')).toBeHidden();
    await page.evaluate(async () => {
      const modulePath = '/assets/js/downloader.js';
      const module = (await import(
        modulePath
      )) as typeof import('../../src/frontend/downloader.js');
      module.initializeDownloader(document, {
        adapter: {
          analyze: () =>
            Promise.resolve({
              id: 'panel-fixture',
              creator: '@travelcreator',
              title: 'An evening by the coast',
              durationSeconds: 23,
              thumbnail: '/assets/images/hero-video-poster.webp',
              formats: [720, 1080].map((width) => ({
                id: String(width),
                label: `${String(width)}p`,
                container: 'mp4' as const,
                width,
                height: Math.round((width * 16) / 9),
                hasAudio: true,
              })),
            }),
          startDownload: () => Promise.reject(new Error('Unused')),
          waitForDownload: () => Promise.reject(new Error('Unused')),
        },
      });
    });
    await page.getByRole('button', { name: 'Get video' }).click();
    await expect(page.getByRole('tab', { name: 'MP4' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tab')).toHaveCount(1);
    await expect(page.locator('#result-creator-initial')).toHaveText('T');
    await expect(page.locator('#result-card')).not.toContainText('MP3');
    await expect(page.locator('#result-card')).not.toContainText('4K');
    await expect(page.locator('#result-card')).not.toContainText('views');
    await expect(page.locator('#result-card')).not.toContainText('Best');
    for (const tile of await page.locator('.format-option').all()) {
      const bounds = await tile.boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('radio', { name: '720p' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('radio', { name: '1080p' })).toBeChecked();
    await expect(
      page
        .locator('.format-option')
        .filter({ has: page.getByRole('radio', { name: '1080p' }) })
        .locator('.selected-indicator'),
    ).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await page
      .locator('#result-card')
      .screenshot({ path: `docs/screenshots/download-panel-${String(width)}.png` });
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await page
      .locator('#result-card')
      .screenshot({ path: `docs/screenshots/download-panel-dark-${String(width)}.png` });
  });
}
