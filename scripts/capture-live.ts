/// <reference lib="dom" />
import { once } from 'node:events';
import { writeFile, readdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { ProductionDownloaderService } from '../src/services/downloader.js';
import { videoUrlSchema } from '../src/shared/video-url.js';

// Explicit manual test. Automated browser tests remain offline.
const url = videoUrlSchema.parse(process.argv[2]);
const service = new ProductionDownloaderService();
const server = createApp(service).listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No test port');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
  acceptDownloads: true,
});
const result: Record<string, unknown> = { source: url, live: true };
const capture = (state: string) =>
  page
    .locator('.hero')
    .screenshot({
      path: `docs/screenshots/live-${state}.png`,
      style: '.site-header { position: static !important; }',
    });
try {
  await page.goto(`http://127.0.0.1:${String(address.port)}`);
  await capture('idle');
  await page.locator('#video-url').fill(url);
  await page.getByRole('button', { name: 'Get video', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('#downloader')?.getAttribute('data-state') === 'ready',
    undefined,
    { timeout: 45000 },
  );
  await page.waitForFunction(
    () =>
      (document.querySelector<HTMLImageElement>('#result-thumbnail')?.naturalWidth ?? 0) >
      0,
  );
  result.thumbnailLocal = (
    await page.locator('#result-thumbnail').getAttribute('src')
  )?.startsWith('/api/v1/analysis/');
  result.formats = await page.locator('#format-options label').allTextContents();
  await capture('ready');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('mobile-ready');
  result.mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  const selected = await page
    .locator('input[name="format"]:checked')
    .getAttribute('value');
  result.selectedFormat = selected;
  await page.getByRole('button', { name: 'Download MP4', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('#downloader')?.getAttribute('data-state') === 'downloading',
  );
  await capture('downloading');
  await page.waitForFunction(
    () =>
      ['completed', 'error'].includes(
        document.querySelector('#downloader')?.getAttribute('data-state') ?? '',
      ),
    undefined,
    { timeout: 135000 },
  );
  result.finalState = await page.locator('#downloader').getAttribute('data-state');
  if (result.finalState === 'completed') {
    await capture('completed');
    result.quality = await page.locator('#completed-quality').textContent();
    result.size = await page.locator('#completed-size').textContent();
    const transfer = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save MP4', exact: true }).click();
    const download = await transfer;
    await download.saveAs('docs/live-browser-verification.mp4');
    result.browserDownloadError = await download.failure();
    result.browserState = await page.locator('#downloader').getAttribute('data-state');
    // Inspect the temp root after file delivery without ending the service first.
    result.remainingJobDirectories = (await readdir(env.DOWNLOAD_TEMP_ROOT)).filter(
      (name) => name.startsWith('job-'),
    ).length;
  } else {
    result.error = await page.locator('#error-message').textContent();
    await capture('error');
  }
} finally {
  await page.close();
  await browser.close();
  await service.dispose();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  result.remainingTemporaryEntries = await readdir(env.DOWNLOAD_TEMP_ROOT).catch(
    () => [],
  );
  await writeFile(
    'docs/LIVE_BROWSER_VERIFICATION.json',
    JSON.stringify(result, null, 2) + '\n',
  );
}
console.log('Live browser verification report saved.');
