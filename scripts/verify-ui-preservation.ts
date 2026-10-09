/// <reference lib="dom" />
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { z } from 'zod';
const base = z.literal('http://127.0.0.1:3101').parse(process.argv[2]);
const after = z.literal('http://127.0.0.1:3100').parse(process.argv[3]);
const directory = 'docs/screenshots/command15';
const browser = await chromium.launch({ channel: 'chrome' });
const findings: unknown[] = [];
try {
  for (const [width, height] of [
    [390, 844],
    [1440, 1000],
  ] as const) {
    const images = new Map<string, Buffer>();
    for (const [name, origin, version] of [
      ['before', base, 'simple-panels-4'],
      ['after', after, 'photo-selection-6'],
    ] as const) {
      await mkdir(`${directory}/${name}`, { recursive: true });
      const page = await browser.newPage({
        viewport: { width, height },
        reducedMotion: 'reduce',
        colorScheme: 'light',
      });
      await page.addInitScript('globalThis.__name = (fn) => fn;');
      await page.goto(origin);
      await page.locator('.site-footer').scrollIntoViewIfNeeded();
      for (const image of await page.locator('picture img').all())
        if (await image.isVisible()) {
          await image.scrollIntoViewIfNeeded();
          await image.evaluate((image) => (image as HTMLImageElement).decode());
        }
      await page.evaluate(() => scrollTo(0, 0));
      for (const state of ['idle', 'mp4', 'mp3'] as const) {
        if (state === 'mp4') {
          await page.evaluate(async (version) => {
            const modulePath = `/assets/js/downloader.js?v=${version}`;
            const module = (await import(
              modulePath
            )) as typeof import('../src/frontend/downloader.js');
            module.initializeDownloader(document, {
              adapter: {
                analyze: () =>
                  Promise.resolve({
                    id: 'preservation-fixture',
                    title: 'Public video UI preservation fixture',
                    creator: 'Fixture creator',
                    durationSeconds: 12,
                    thumbnail: '/assets/images/preview-unavailable.webp',
                    downloadAvailable: true,
                    capabilities: { mp4: true, mp3: true },
                    formats: [720, 576].map((width) => ({
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
          }, version);
          await page
            .locator('#video-url')
            .fill('https://www.tiktok.com/@creator/video/123');
          await page.getByRole('button', { name: 'Get video', exact: true }).click();
          await page.locator('#result-card').waitFor({ state: 'visible' });
        }
        if (state === 'mp3') await page.getByRole('radio', { name: /MP3 Audio/ }).click();
        await page.mouse.move(0, 0);
        await page.evaluate(() => (document.activeElement as HTMLElement).blur());
        await page.locator('#result-thumbnail').evaluate(async (node) => {
          const image = node as HTMLImageElement;
          if (image.src) await image.decode().catch(() => undefined);
        });
        await page.evaluate(async () => {
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          scrollTo({ top: 0, behavior: 'instant' });
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
        });
        const bytes = await page.screenshot({
          path: `${directory}/${name}/${String(width)}-${state}.png`,
          fullPage: true,
          animations: 'disabled',
        });
        const decoded = await sharp(bytes).raw().toBuffer();
        if (name === 'before') images.set(state, decoded);
        else
          findings.push({
            width,
            height,
            state,
            identicalPixels: decoded.equals(images.get(state) ?? Buffer.alloc(0)),
          });
        if (state !== 'idle') {
          await page
            .locator('#result-card')
            .evaluate((node) =>
              node.scrollIntoView({ block: 'start', behavior: 'instant' }),
            );
          const panel = await page
            .locator('#result-card')
            .screenshot({
              path: `${directory}/${name}/${String(width)}-${state}-panel.png`,
              style: 'header,.skip-link{visibility:hidden!important;}',
            });
          const raw = await sharp(panel).raw().toBuffer();
          if (name === 'before') images.set(`${state}-panel`, raw);
          else
            findings.push({
              width,
              height,
              state: `${state}-panel`,
              identicalPixels: raw.equals(
                images.get(`${state}-panel`) ?? Buffer.alloc(0),
              ),
            });
        }
      }
      await page.close();
    }
  }
  await writeFile(
    `${directory}/ui-comparison.json`,
    JSON.stringify(findings, null, 2) + '\n',
  );
  process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
} finally {
  await browser.close();
}
