/// <reference lib="dom" />
import { screenshotRoot } from './evidence.js';
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

for (const width of [390, 1440]) {
  test(`local homepage performance at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    await page.addInitScript(() => {
      const metrics = { lcpMs: 0, lcpElement: '', cls: 0, observedLongTaskBlockingMs: 0 };
      Object.assign(window, { auditMetrics: metrics });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          metrics.lcpMs = entry.startTime;
          metrics.lcpElement =
            (entry as PerformanceEntry & { element?: Element }).element?.tagName ?? '';
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            hadRecentInput: boolean;
            value: number;
          };
          if (!shift.hadRecentInput) metrics.cls += shift.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            metrics.observedLongTaskBlockingMs += Math.max(0, entry.duration - 50);
        }).observe({ type: 'longtask', buffered: true });
      }
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toBeVisible();
    const evidence = await page.evaluate(() => ({
      ...(
        window as unknown as {
          auditMetrics: {
            lcpMs: number;
            lcpElement: string;
            cls: number;
            observedLongTaskBlockingMs: number;
          };
        }
      ).auditMetrics,
      fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      longTaskObservationSupported:
        PerformanceObserver.supportedEntryTypes.includes('longtask'),
      fontStatus: document.fonts.status,
      resources: performance.getEntriesByType('resource').map((entry) => {
        const resource = entry as PerformanceResourceTiming;
        return {
          path: new URL(resource.name).pathname,
          durationMs: resource.duration,
          transferBytes: resource.transferSize,
        };
      }),
      images: [...document.images]
        .filter((image) => image.closest('picture'))
        .map((image) => ({
          path: new URL(image.currentSrc || image.src).pathname,
          loading: image.loading,
          priority: image.fetchPriority,
          width: image.width,
          height: image.height,
        })),
    }));
    await mkdir(`${screenshotRoot}/launch`, { recursive: true });
    await writeFile(
      `${screenshotRoot}/launch/${String(width)}-performance.json`,
      JSON.stringify(
        {
          scope:
            'Local Chrome, unthrottled, fresh browser context, reduced motion. Not field Core Web Vitals or VPS results.',
          ...evidence,
        },
        null,
        2,
      ) + '\n',
    );
  });
}
