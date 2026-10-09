/// <reference lib="dom" />
import { screenshotRoot } from './evidence.js';
import { expect, test } from '@playwright/test';

for (const [width, height] of [
  [390, 844],
  [768, 1024],
  [1440, 1000],
] as const) {
  test(`MP3 result states and keyboard switching at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.evaluate(async () => {
      const modulePath = '/assets/js/downloader.js?v=photo-selection-6';
      const module = (await import(
        modulePath
      )) as typeof import('../../src/frontend/downloader.js');
      let available = true;
      document.addEventListener('audio-unavailable', () => {
        available = false;
      });
      module.initializeDownloader(document, {
        adapter: {
          analyze: () =>
            Promise.resolve({
              id: 'fixture',
              title: 'An evening by the coast',
              creator: 'Travel creator',
              durationSeconds: 24,
              thumbnail: '/assets/images/hero-video-poster.webp',
              downloadAvailable: true,
              capabilities: { mp4: true, mp3: available },
              formats: [720, 576].map((width) => ({
                id: String(width),
                label: `${String(width)}p`,
                width,
                height: Math.round((width * 16) / 9),
                container: 'mp4' as const,
                hasAudio: true,
              })),
            }),
          startDownload: () =>
            new Promise((resolve) =>
              document.addEventListener('audio-start', () => resolve({ id: 'job' }), {
                once: true,
              }),
            ),
          waitForDownload: (_job, signal, report) => {
            report({ phase: 'converting' });
            return new Promise((resolve, reject) => {
              document.addEventListener(
                'audio-complete',
                () =>
                  resolve({
                    url: '/api/v1/downloads/job/file',
                    qualityLabel: 'MP3 Audio',
                    sizeBytes: 16384,
                  }),
                { once: true, signal },
              );
              document.addEventListener(
                'audio-fail',
                () =>
                  reject(
                    new Error(
                      'The audio could not be converted. Please try again later.',
                    ),
                  ),
                { once: true, signal },
              );
            });
          },
        },
        requestDownload: () => undefined,
      });
    });
    const capture = async (state: string) => {
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      await page.locator('#result-card').screenshot({
        path: `${screenshotRoot}/mp3-${String(width)}-${state}.png`,
        style: '.site-header { visibility: hidden !important; }',
      });
    };
    await page.locator('#video-url').fill('https://www.tiktok.com/@test/video/123');
    await page.getByRole('button', { name: 'Get video' }).click();
    const mp4 = page.getByRole('radio', { name: /MP4 Video/ });
    const mp3 = page.getByRole('radio', { name: /MP3 Audio/ });
    await expect(mp4).toBeChecked();
    await page
      .locator('.format-option')
      .filter({ has: page.getByRole('radio', { name: /576p/ }) })
      .click();
    await capture('mp4');
    await mp4.focus();
    await page.keyboard.press('ArrowRight');
    await expect(mp3).toBeChecked();
    await expect(page.locator('#video-quality-panel')).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Download MP3', exact: true }),
    ).toBeEnabled();
    await capture('selected');
    await page.keyboard.press('ArrowLeft');
    await expect(mp4).toBeChecked();
    await expect(page.getByRole('radio', { name: /576p/ })).toBeChecked();
    await mp3.check();
    await page.getByRole('button', { name: 'Download MP3', exact: true }).click();
    await expect(page.locator('#progress-title')).toHaveText('Preparing MP3…');
    await capture('preparing');
    await page.evaluate(() => document.dispatchEvent(new Event('audio-start')));
    await expect(page.locator('#progress-title')).toHaveText('Converting audio to MP3…');
    await expect(page.locator('#download-progress')).not.toHaveAttribute('value');
    await capture('converting');
    await page.evaluate(() => document.dispatchEvent(new Event('audio-complete')));
    await expect(page.locator('#completed-title')).toHaveText('Your MP3 is ready');
    await expect(
      page.getByRole('button', { name: 'Save MP3', exact: true }),
    ).toBeEnabled();
    await capture('completed');
    await page.getByRole('button', { name: 'Download another video' }).click();
    await page.locator('#video-url').fill('https://vt.tiktok.com/again/');
    await page.getByRole('button', { name: 'Get video' }).click();
    await expect(mp4).toBeChecked();
    await mp3.check();
    await page.getByRole('button', { name: 'Download MP3', exact: true }).click();
    await page.evaluate(() => document.dispatchEvent(new Event('audio-start')));
    await expect(page.locator('#progress-title')).toHaveText('Converting audio to MP3…');
    await page.evaluate(() => document.dispatchEvent(new Event('audio-fail')));
    await expect(page.locator('#error-message')).toContainText('could not be converted');
    await capture('error');
    await page.evaluate(() => document.dispatchEvent(new Event('audio-unavailable')));
    await page.locator('#video-url').fill('https://vt.tiktok.com/silent/');
    await page.getByRole('button', { name: 'Get video' }).click();
    await expect(mp3).toBeDisabled();
    await expect(page.locator('#audio-unavailable')).toBeVisible();
    await capture('unavailable');
  });
}
