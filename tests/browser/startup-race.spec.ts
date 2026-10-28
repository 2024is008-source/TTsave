import { expect, test } from '@playwright/test';

test('holds native submissions while the downloader module is delayed, then initializes once', async ({
  page,
}) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let analyses = 0;
  let native = false;
  await page.route('**/assets/js/downloader.js?*', async (route) => {
    await gate;
    await route.continue();
  });
  await page.route('**/api/v1/analyze', async (route) => {
    analyses++;
    native ||= route.request().isNavigationRequest();
    await route.fulfill({
      status: 422,
      json: {
        error: {
          code: 'VIDEO_UNAVAILABLE',
          message: 'Fixture source unavailable',
          retryable: false,
          fieldErrors: {},
          requestId: 'fixture',
        },
      },
    });
  });
  const loading = page.waitForRequest((request) =>
    request.url().includes('/assets/js/downloader.js'),
  );
  try {
    await page.goto('/', { waitUntil: 'commit' });
    await loading;
    await page.locator('#video-url').fill('https://www.tiktok.com/@fixture/video/123');
    await page.locator('.analyze-button').click();
    await expect(page.locator('#form-status')).toContainText('downloader is loading');
    await page.locator('#video-url').press('Enter');
    expect(analyses).toBe(0);
    expect(new URL(page.url()).pathname).toBe('/');
    release?.();
    await expect(page.locator('#form-status')).toContainText('Downloader ready');
    await page.locator('.analyze-button').click();
    await expect.poll(() => analyses).toBe(1);
    expect(native).toBe(false);
    expect(new URL(page.url()).pathname).toBe('/');
  } finally {
    release?.();
  }
});

test('module failure gives accessible feedback and never falls back to API navigation', async ({
  page,
}) => {
  let analyses = 0;
  await page.route('**/assets/js/downloader.js?*', (route) => route.abort());
  await page.route('**/api/v1/analyze', (route) => {
    analyses++;
    return route.fulfill({ json: {} });
  });
  await page.goto('/');
  await expect(page.locator('#form-status')).toContainText('could not start');
  await page.locator('#video-url').fill('https://www.tiktok.com/@fixture/video/123');
  await page.locator('#video-url').press('Enter');
  expect(analyses).toBe(0);
  await expect(page.locator('#form-status')).toContainText('Refresh the page');
  expect(new URL(page.url()).pathname).toBe('/');
});

test('different module cache versions still own only one set of downloader handlers', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const audit = window as typeof window & { duplicateAnalysisCount?: number };
    audit.duplicateAnalysisCount = 0;
    const adapter = {
      analyze: () => {
        audit.duplicateAnalysisCount = (audit.duplicateAnalysisCount ?? 0) + 1;
        return Promise.resolve({
          id: 'duplicate-fixture',
          title: 'Duplicate-handler fixture',
          formats: [{ id: 'one', label: 'MP4', hasAudio: true }],
          downloadAvailable: true,
        });
      },
      startDownload: () => Promise.reject(new Error('Not used')),
      waitForDownload: () => Promise.reject(new Error('Not used')),
    };
    for (const version of ['duplicate-a', 'duplicate-b']) {
      const modulePath = '/assets/js/downloader.js?v=' + version;
      const module = (await import(
        modulePath
      )) as typeof import('../../src/frontend/downloader.js');
      module.initializeDownloader(document, { adapter });
    }
  });
  await page.locator('#video-url').fill('https://www.tiktok.com/@fixture/video/123');
  await page.locator('.analyze-button').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { duplicateAnalysisCount?: number })
            .duplicateAnalysisCount,
      ),
    )
    .toBe(1);
  await expect(page.locator('#result-title')).toHaveText('Duplicate-handler fixture');
});
