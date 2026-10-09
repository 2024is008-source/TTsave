/// <reference lib="dom" />
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const viewports = [
  [390, 844],
  [430, 932],
  [768, 1024],
  [1024, 900],
  [1440, 1000],
  [1920, 1080],
] as const;
for (const [width, height] of viewports) {
  for (const theme of ['light', 'dark'] as const) {
    test(`launch states ${String(width)}x${String(height)} ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/');
      if (
        theme === 'dark' &&
        (await page.locator('html').getAttribute('data-theme')) !== 'dark'
      ) {
        await page.getByRole('button', { name: 'Switch to dark theme' }).click();
      }
      const directory = 'docs/screenshots/launch';
      await mkdir(directory, { recursive: true });
      const findings: unknown[] = [];
      const capture = async (state: string) => {
        await page.locator('.site-footer').scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollTo(0, 0));
        for (const image of await page.locator('picture img').all()) {
          if (await image.isVisible()) {
            await image.scrollIntoViewIfNeeded();
            await expect(image).toHaveJSProperty('complete', true);
          }
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `${directory}/${String(width)}-${theme}-${state}.png`,
          fullPage: true,
        });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
        if (state !== 'idle') {
          const panel = page.locator('#result-card');
          expect(
            await panel.evaluate((node) => node.scrollHeight <= node.clientHeight + 1),
          ).toBe(true);
          const bounds = await panel.boundingBox();
          expect(bounds?.x).toBeGreaterThanOrEqual(0);
          expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
        }
        const scan = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        for (const violation of scan.violations)
          findings.push({
            state,
            rule: violation.id,
            nodes: violation.nodes.map((node) => ({
              target: node.target,
              summary: node.failureSummary,
            })),
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
                id: 'audit-fixture',
                title: 'Synthetic audit fixture: public video format selection',
                creator: 'Audit fixture',
                thumbnail: '/assets/images/preview-unavailable.webp',
                durationSeconds: 12,
                downloadAvailable: true,
                capabilities: { mp4: true, mp3: true },
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
                document.addEventListener(
                  'audit-start',
                  () => resolve({ id: 'audit-job' }),
                  { once: true },
                ),
              ),
            waitForDownload: (_job, signal, report) => {
              report({ phase: 'converting' });
              return new Promise((_resolve, reject) => {
                document.addEventListener(
                  'audit-fail',
                  () =>
                    reject(
                      new Error(
                        'The audio could not be converted. Please try again later.',
                      ),
                    ),
                  { once: true, signal },
                );
                signal.addEventListener('abort', () => reject(new Error('Cancelled')), {
                  once: true,
                });
              });
            },
          },
          requestDownload: () => undefined,
        });
      });
      await page.locator('#video-url').fill('https://www.tiktok.com/@test/video/123');
      await page.getByRole('button', { name: 'Get video' }).click();
      const mp4 = page.getByRole('radio', { name: /MP4 Video/ });
      const mp3 = page.getByRole('radio', { name: /MP3 Audio/ });
      await expect(mp4).toBeChecked();
      await expect(page.locator('#result-title')).toBeFocused();
      await page
        .locator('.format-option')
        .filter({ has: page.locator('#format-1') })
        .click();
      await capture('mp4');
      await mp4.focus();
      await page.keyboard.press('ArrowRight');
      await expect(mp3).toBeChecked();
      await capture('mp3');
      await page.keyboard.press('ArrowLeft');
      await expect(mp4).toBeChecked();
      await expect(page.getByRole('radio', { name: '576p', exact: true })).toBeChecked();
      await mp4.focus();
      await page.keyboard.press('ArrowRight');
      await page.getByRole('button', { name: 'Download MP3', exact: true }).click();
      await expect(page.locator('#progress-title')).toHaveText('Preparing MP3…');
      await page.evaluate(() => document.dispatchEvent(new Event('audit-start')));
      await expect(page.locator('#progress-title')).toHaveText(
        'Converting audio to MP3…',
      );
      await expect(page.locator('#download-progress')).not.toHaveAttribute('value');
      await capture('processing');
      await page.evaluate(() => document.dispatchEvent(new Event('audit-fail')));
      await expect(page.locator('#error-message')).toContainText(
        'could not be converted',
      );
      await capture('error');
      const undersized = await page
        .locator(
          'button:visible, summary:visible, .rp-media-choice:visible, .format-option:visible, .wordmark:visible, .desktop-nav a:visible, .mobile-nav a:visible, .footer-nav a:visible, .footer-dmca a:visible',
        )
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => {
              const box = node.getBoundingClientRect();
              return box.width < 44 || box.height < 44;
            })
            .map((node) => node.getAttribute('class')),
        );
      await writeFile(
        `${directory}/${String(width)}-${theme}-accessibility.json`,
        JSON.stringify({ findings, undersized }, null, 2) + '\n',
      );
      expect(undersized).toEqual([]);
      expect(findings).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
