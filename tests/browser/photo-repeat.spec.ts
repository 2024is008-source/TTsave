/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

for (const [width, height] of [
  [390, 640],
  [390, 844],
  [1440, 900],
] as const) {
  test(`save successive images without reanalysis at ${String(width)}x${String(height)}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const analysisId = '123e4567-e89b-42d3-a456-426614174000';
    const capability = 'a'.repeat(43);
    const photos = Array.from({ length: 25 }, (_, index) => index + 1).map(
      (position) => ({
        id: `123e4567-e89b-42d3-a456-426614174${String(position).padStart(3, '0')}`,
        position,
        previewUrl: `/api/v1/analysis/${analysisId}/photos/123e4567-e89b-42d3-a456-426614174${String(position).padStart(3, '0')}/preview?token=${capability}`,
      }),
    );
    let analyses = 0;
    const selected: string[] = [];
    const cancelled: string[] = [];
    await page.route('**/api/v1/analyze', (route) => {
      analyses++;
      return route.fulfill({
        json: {
          id: analysisId,
          postType: 'photo',
          title:
            'Public wallpapers with a long title and several descriptive hashtags #wallpaper #aesthetic #nature #public',
          creator: 'Creator',
          thumbnail: null,
          durationSeconds: null,
          sourceUrl: 'https://www.tiktok.com/@creator/photo/123',
          formats: [],
          photos,
          capability,
          mock: false,
          downloadAvailable: true,
          capabilities: { images: true, mp4: false, mp3: false },
        },
      });
    });
    await page.route('**/photos/*/preview?*', (route) =>
      route.fulfill({
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="900"><rect width="300" height="900" fill="#8249ec"/></svg>',
        contentType: 'image/svg+xml',
      }),
    );
    await page.route('**/api/v1/downloads', (route) => {
      const body = route.request().postDataJSON() as { photoId: string };
      expect(body).toEqual({
        analysisId,
        photoId: photos[selected.length]?.id,
        downloadType: 'image',
        capability,
      });
      selected.push(body.photoId);
      return route.fulfill({
        json: {
          id: `123e4567-e89b-42d3-a456-42661417401${String(selected.length)}`,
          analysisId,
          formatId: body.photoId,
          downloadType: 'image',
          status: 'queued',
          mock: false,
          accessToken: 'b'.repeat(43),
        },
      });
    });
    await page.route('**/api/v1/downloads/*/events', (route) => {
      const jobId = route.request().url().split('/').at(-2);
      if (!jobId) throw new Error('Missing job ID');
      return route.fulfill({
        contentType: 'text/event-stream',
        body: `event: job\ndata: ${JSON.stringify({
          id: jobId,
          analysisId,
          formatId: selected.at(-1),
          downloadType: 'image',
          status: 'ready',
          mock: false,
          fileUrl: `/api/v1/downloads/${jobId}/file?token=${'c'.repeat(43)}`,
          fileExpiresAt: Date.now() + 60000,
        })}\n\n`,
      });
    });
    await page.route(/\/api\/v1\/downloads\/[^/?]+$/, (route) => {
      if (route.request().method() === 'DELETE') cancelled.push(route.request().url());
      return route.fulfill({ json: {} });
    });
    await page.goto('/');
    await page.locator('#video-url').fill('https://www.tiktok.com/@creator/photo/123');
    await page.getByRole('button', { name: 'Get video', exact: true }).click();
    for (let index = 0; index < 3; index++) {
      await expect(page.locator('#photo-position')).toHaveText(
        `${String(index + 1)} of 25`,
      );
      await page.locator('#photo-download').click();
      const save = page.getByRole('button', { name: 'Save image', exact: true });
      await expect(save).toBeEnabled();
      await expect(save).toBeInViewport({ ratio: 1 });
      if (index === 0)
        await page.screenshot({ path: testInfo.outputPath('compact-photo-ready.png') });
      expect(
        await page
          .locator('#result-card')
          .evaluate((element) => element.getBoundingClientRect().height),
      ).toBeLessThanOrEqual(height - 100);
      const downloadEvent = page.waitForEvent('download');
      await save.click();
      const download = await downloadEvent;
      // Chrome attachment requests bypass route fixtures. Assert the browser
      // handoff; HTTP photo tests cover the file bytes and attachment headers.
      const file = new URL(download.url());
      expect(file.pathname + file.search).toBe(
        `/api/v1/downloads/123e4567-e89b-42d3-a456-42661417401${String(index + 1)}/file?token=${'c'.repeat(43)}`,
      );
      await download.cancel();
      await expect(page.locator('#downloader')).toHaveAttribute('data-state', 'ready');
      await expect(page.locator('#photo-download')).toBeEnabled();
      await expect(page.locator('#photo-download')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('#download-form')).toHaveAttribute('aria-busy', 'false');
      if (index === 0) await page.locator('#photo-next').click();
      if (index === 1) await page.getByRole('button', { name: 'Select image 3' }).click();
    }
    await page.locator('#photo-gallery').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#photo-position')).toHaveText('2 of 25');
    await expect(page.locator('#photo-download')).toBeEnabled();
    expect(analyses).toBe(1);
    expect(cancelled).toEqual([]);
    expect(selected).toEqual(photos.slice(0, 3).map((photo) => photo.id));
    for (let index = 2; index < 25; index++) await page.locator('#photo-next').click();
    await expect(page.locator('#photo-position')).toHaveText('25 of 25');
    await expect(page.locator('#photo-thumbnails button:visible')).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Select image 25' })).toBeInViewport({
      ratio: 1,
    });
    expect(
      await page
        .locator('#photo-thumbnails')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
  });
}
