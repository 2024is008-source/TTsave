/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

test('active phone and result panel persist through download states', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const capture = async (state: string) => {
    await expect(page.locator('.hero-art')).toBeVisible();
    await expect(page.locator('.phone:visible')).toHaveCount(1);
    await page.locator('.hero').screenshot({
      path: `docs/screenshots/state-${state}.png`,
        style: '.site-header, .skip-link { visibility: hidden !important; }',
    });
  };
  await capture('idle');
  await page.evaluate(async () => {
    const modulePath = '/assets/js/downloader.js';
    const module = (await import(
      modulePath
    )) as typeof import('../../src/frontend/downloader.js');
    module.initializeDownloader(document, {
      adapter: {
        analyze: () =>
          Promise.resolve({
            id: 'fixture',
            title: 'An evening by the coast',
            creator: 'Travel creator',
            thumbnail: '/assets/images/hero-video-poster.webp',
            durationSeconds: 24,
            formats: [1080, 720, 576].map((width) => ({
              id: String(width),
              label: `${String(width)}p`,
              width,
              height: Math.round((width * 16) / 9),
              container: 'mp4' as const,
              hasAudio: true,
            })),
          }),
        startDownload: () => Promise.resolve({ id: 'job' }),
        waitForDownload: (_job, signal, report) =>
          new Promise((resolve, reject) => {
            document.addEventListener(
              'test-progress',
              () =>
                report({
                  percent: 40,
                  downloadedBytes: 2097152,
                  sizeBytes: 5242880,
                  speedBytesPerSecond: 524288,
                }),
              { once: true, signal },
            );
            document.addEventListener(
              'test-complete',
              () => resolve({ url: '/api/v1/downloads/test/file', sizeBytes: 5242880 }),
              { once: true, signal },
            );
            signal.addEventListener('abort', () => reject(new Error('cancelled')), {
              once: true,
            });
          }),
      },
      requestDownload: () => undefined,
    });
  });
  await page.locator('#video-url').fill('https://www.tiktok.com/@test/video/123');
  await page.getByRole('button', { name: 'Get video' }).click();
  await expect(page.locator('#result-title')).toBeFocused();
  const originalPhone = await page.locator('.idle-phone').boundingBox();
  await capture('ready');
  await page
    .locator('.format-option')
    .filter({ has: page.locator('#format-1') })
    .click();
  await expect(page.getByRole('radio', { name: /720p/ })).toBeChecked();
  await page.getByRole('button', { name: 'Download MP4', exact: true }).click();
  await expect(page.locator('#downloader')).toHaveAttribute('data-state', 'downloading');
  await expect(page.locator('#download-progress')).not.toHaveAttribute('value');
  await page.evaluate(() => document.dispatchEvent(new Event('test-progress')));
  await expect(page.locator('#download-progress')).toHaveAttribute('value', '40');
  await capture('downloading');
  await page.evaluate(() => document.dispatchEvent(new Event('test-complete')));
  await expect(page.locator('#downloader')).toHaveAttribute('data-state', 'completed');
  await expect(page.getByRole('button', { name: 'Save MP4', exact: true })).toBeEnabled();
  await expect(page.locator('#completed-quality')).toHaveText('720p');
  await capture('completed');
  const completedPhone = await page.locator('.idle-phone').boundingBox();
  if (!originalPhone || !completedPhone) throw new Error('Missing phone');
  // Focus scrolling and panel height can move the phone vertically; its hardware
  // size and horizontal position remain stable across states.
  expect(completedPhone.width).toBeCloseTo(originalPhone.width, 1);
  expect(completedPhone.height).toBeCloseTo(originalPhone.height, 1);
  expect(completedPhone.x).toBeCloseTo(originalPhone.x, 1);
  await expect(page.locator('.phone:visible')).toHaveCount(1);
  await expect(page.locator('.hero h1')).toBeVisible();
  const panel = await page.locator('#result-card').boundingBox();
  if (!panel) throw new Error('Missing result panel');
  expect(panel.width).toBeLessThanOrEqual(560);
  await expect(page.locator('.hero-art')).toBeVisible();
  await page.getByRole('button', { name: 'Download another video' }).click();
  await expect(page.locator('#video-url')).toHaveValue('');
  await expect(page.locator('#result-card')).toBeHidden();
});
