import { expect, test } from '@playwright/test';

test('frontend uses authorized job events and a completed single-use file URL', async ({
  page,
}) => {
  const analysisId = '123e4567-e89b-42d3-a456-426614174000';
  const jobId = '123e4567-e89b-42d3-a456-426614174001';
  const accessToken = 'a'.repeat(43);
  const fileToken = 'b'.repeat(43);
  const fileUrl = `/api/v1/downloads/${jobId}/file?token=${fileToken}`;
  const baseJob = { id: jobId, analysisId, formatId: 'source-1', mock: false };
  await page.route('**/api/v1/analyze', (route) =>
    route.fulfill({
      json: {
        id: analysisId,
        title: 'Browser-only source fixture',
        creator: 'Test creator',
        thumbnail: null,
        durationSeconds: 8,
        sourceUrl: 'https://www.tiktok.com/@test/video/123',
        mock: false,
        downloadAvailable: true,
        formats: [
          {
            id: 'source-1',
            container: 'mp4',
            qualityLabel: 'Source MP4 video',
            hasAudio: true,
          },
        ],
      },
    }),
  );
  await page.route('**/api/v1/downloads', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ analysisId, formatId: 'source-1' });
    await route.fulfill({
      status: 201,
      json: { ...baseJob, status: 'queued', accessToken },
    });
  });
  await page.route(`**/api/v1/downloads/${jobId}/events`, async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
    const jobs = [
      { ...baseJob, status: 'downloading', progress: {} },
      { ...baseJob, status: 'downloading', progress: { percent: 50, sizeBytes: 32 } },
      { ...baseJob, status: 'ready', fileUrl, fileExpiresAt: Date.now() + 60_000 },
    ];
    await route.fulfill({
      contentType: 'text/event-stream',
      body: jobs.map((job) => `event: job\ndata: ${JSON.stringify(job)}\n\n`).join(''),
    });
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  await page.locator('#video-url').fill('https://www.tiktok.com/@test/video/123');
  await page.getByRole('button', { name: 'Check link' }).click();
  await expect(page.locator('#result-title')).toBeFocused();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Request download', exact: true }).click();
  const download = await downloadEvent;
  // Chrome's attachment requests bypass route fixtures. Verify the browser handoff;
  // HTTP integration tests verify the actual file, attachment headers and cleanup.
  expect(new URL(download.url()).pathname + new URL(download.url()).search).toBe(fileUrl);
  await download.cancel();
  await expect(page.locator('#downloader')).toHaveAttribute(
    'data-state',
    'download-requested',
  );
  await expect(page.locator('#form-status')).toContainText('saving is not confirmed');
  await expect(page.locator('#form-status')).toBeFocused();
});
