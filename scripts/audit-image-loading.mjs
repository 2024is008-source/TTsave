/* global window, location */
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { z } from 'zod';
process.env.LOG_LEVEL = 'silent';
process.env.GA_MEASUREMENT_ID = '';
const phase = z.enum(['before', 'after']).parse(process.argv[2]);
const { createApp } = await import('../dist/app.js');
const { ProductionDownloaderService } = await import('../dist/services/downloader.js');
const service = new ProductionDownloaderService();
const server = createApp(service).listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw Error('No local address');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const pages = [];
const paths = [
  '/',
  '/blog',
  '/blog/how-to-convert-tiktok-to-mp4',
  '/blog/how-to-convert-tiktok-to-mp3',
  '/blog/how-to-download-tiktok-images',
  '/blog/how-to-download-tiktok-videos-on-pc',
];
try {
  for (const width of [390, 768, 1024, 1440])
    for (const dpr of [1, 2])
      for (const route of paths) {
        const context = await browser.newContext({
          viewport: { width, height: 1000 },
          deviceScaleFactor: dpr,
          reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        await page.addInitScript(() => {
          window.imageMetrics = { lcpMs: 0, lcpImage: '', cls: 0 };
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              window.imageMetrics.lcpMs = e.startTime;
              window.imageMetrics.lcpImage =
                e.element?.currentSrc || e.element?.tagName || '';
            }
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver((list) => {
            for (const e of list.getEntries())
              if (!e.hadRecentInput) window.imageMetrics.cls += e.value;
          }).observe({ type: 'layout-shift', buffered: true });
        });
        const response = await page.goto(`http://127.0.0.1:${address.port}${route}`);
        if (response.status() !== 200) throw Error('Route failed');
        await page.waitForLoadState('networkidle');
        const initial = await page.evaluate(() => ({
          ...window.imageMetrics,
          resources: performance
            .getEntriesByType('resource')
            .filter((e) => /\.(webp|png|jpg|svg)(?:\?|$)/.test(e.name))
            .map((e) => ({ path: new URL(e.name).pathname, bytes: e.encodedBodySize })),
        }));
        for (const image of await page.locator('img').all())
          if (await image.isVisible()) {
            await image.scrollIntoViewIfNeeded();
            await image.evaluate((img) => img.decode());
          }
        const images = await page.locator('img').evaluateAll((nodes) =>
          nodes.map((img) => {
            const r = img.getBoundingClientRect();
            return {
              path: new URL(img.currentSrc || img.src || location.href).pathname,
              src: img.getAttribute('src'),
              srcset:
                img.srcset || img.parentElement?.querySelector('source')?.srcset || '',
              sizes: img.sizes || img.parentElement?.querySelector('source')?.sizes || '',
              width: r.width,
              height: r.height,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              visible: !!img.getClientRects().length,
              loading: img.loading,
              priority: img.fetchPriority,
              alt: img.alt,
            };
          }),
        );
        const resources = await page.evaluate(() =>
          performance
            .getEntriesByType('resource')
            .filter((e) => /\.(webp|png|jpg|svg)(?:\?|$)/.test(e.name))
            .map((e) => ({ path: new URL(e.name).pathname, bytes: e.encodedBodySize })),
        );
        pages.push({
          route,
          width,
          dpr,
          initial,
          images,
          resources,
          imageBytes: resources.reduce((sum, r) => sum + r.bytes, 0),
        });
        await context.close();
      }
  await writeFile(
    `docs/IMAGE_LOADING_${phase.toUpperCase()}.json`,
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        scope:
          'Local Chrome, fresh contexts, unthrottled; initial viewport then all visible images decoded by scrolling. Not Lighthouse or field CWV.',
        pages,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Saved ${pages.length} page/viewport/DPR measurements (${phase}).`);
} finally {
  await browser.close();
  await service.dispose();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
