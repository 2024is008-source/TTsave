/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

test('keyboard selection, cancellation, real progress and browser handoff', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(async () => {
    const modulePath = '/assets/js/downloader.js';
    const module = (await import(
      modulePath
    )) as typeof import('../../src/frontend/downloader.js');
    module.initializeDownloader(document, {
      adapter: {
        analyze: () =>
          Promise.resolve({
            id: 'test-media',
            title: 'Test-only API fixture',
            formats: [
              { id: 'one', label: 'Source format' },
              { id: 'two', label: 'Alternative format' },
            ],
          }),
        startDownload: () => Promise.resolve({ id: 'test-job' }),
        waitForDownload: (_job, signal, report) =>
          new Promise((resolve, reject) => {
            document.addEventListener(
              'test-progress',
              () => report({ percent: 40, speedBytesPerSecond: 512 }),
              { once: true, signal },
            );
            document.addEventListener(
              'test-file-ready',
              () => resolve({ url: '/api/v1/downloads/test-ticket/file' }),
              { once: true, signal },
            );
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          }),
      },
      requestDownload: () => document.dispatchEvent(new Event('test-browser-requested')),
    });
  });
  await page.locator('#video-url').fill('https://www.tiktok.com/@test/video/123');
  await page.getByRole('button', { name: 'Check link' }).click();
  await expect(page.locator('#result-title')).toBeFocused();
  const source = page.getByRole('radio', { name: 'Source format' });
  const alternative = page.getByRole('radio', { name: 'Alternative format' });
  await source.focus();
  await page.keyboard.press('ArrowDown');
  await expect(alternative).toBeChecked();
  await page.getByRole('button', { name: 'Request download', exact: true }).click();
  await expect(page.locator('#downloader')).toHaveAttribute('data-state', 'downloading');
  await expect(page.locator('#download-progress')).not.toHaveAttribute('value');
  await page.getByRole('button', { name: 'Cancel download request' }).click();
  await expect(page.locator('#downloader')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#result-title')).toBeFocused();
  await expect(page.locator('#video-url')).toHaveValue(
    'https://www.tiktok.com/@test/video/123',
  );
  await page.getByRole('button', { name: 'Request download', exact: true }).click();
  await expect(page.locator('#downloader')).toHaveAttribute('data-state', 'downloading');
  await page.evaluate(() => document.dispatchEvent(new Event('test-progress')));
  await expect(page.locator('#download-progress')).toHaveAttribute('value', '40');
  await expect(page.locator('#progress-metrics')).toContainText('512 bytes/s');
  await page.evaluate(() => document.dispatchEvent(new Event('test-file-ready')));
  await expect(page.locator('#downloader')).toHaveAttribute(
    'data-state',
    'download-requested',
  );
  await expect(page.locator('#form-status')).toBeFocused();
  await expect(page.locator('#form-status')).toContainText('saving is not confirmed');
});
