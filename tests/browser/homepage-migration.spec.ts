import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

for (const width of [320, 390, 768, 1440]) {
  test(`new homepage tabs, navigation and actual API adapter at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let requests = 0;
    await page.route('**/api/v1/analyze', async (route) => {
      requests++;
      expect(route.request().method()).toBe('POST');
      expect(route.request().isNavigationRequest()).toBe(false);
      expect(route.request().postDataJSON()).toEqual({
        url: 'https://www.tiktok.com/@test/video/123',
      });
      await route.fulfill({
        status: 200,
        json: {
          id: 'd355861d-448f-43f3-807c-8a6c34e7e74a',
          postType: 'video',
          title: 'Actual adapter fixture',
          creator: '@test',
          durationSeconds: 20,
          thumbnail: null,
          downloadAvailable: true,
          sourceUrl: 'https://www.tiktok.com/@test/video/123',
          mock: false,
          capabilities: { mp4: true, mp3: true },
          formats: [
            {
              id: 'source-1',
              qualityLabel: '720p',
              container: 'mp4',
              hasAudio: true,
              width: 720,
              height: 1280,
            },
          ],
        },
      });
    });
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.locator('.hero-art, .phone, .showcase-decoration')).toHaveCount(0);
    await expect(page.locator('#hero-title')).toHaveText(
      'Download TikTok Videos & Photos',
    );
    const photo = page.getByRole('tab', { name: 'Photo', exact: true });
    const video = page.getByRole('tab', { name: 'Video', exact: true });
    await expect(photo).toHaveAttribute('aria-selected', 'true');
    await photo.focus();
    await page.keyboard.press('ArrowRight');
    await expect(video).toBeFocused();
    await expect(video).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#panel-tool-title')).toHaveText(
      'Download TikTok Videos as MP4',
    );
    await expect(page.locator('#downloader-panel')).toHaveCSS('border-top-width', '3px');
    await photo.click();
    await page.locator('#video-url').fill('https://www.tiktok.com/@test/video/123');
    await page.locator('.analyze-button').click();
    await expect(page.locator('#result-title')).toHaveText('Actual adapter fixture');
    await expect(video).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('radio', { name: /MP3 Audio/ })).toBeEnabled();
    expect(requests).toBe(1);
    expect(new URL(page.url()).pathname).toBe('/');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    if (width < 1024) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.locator('#mobile-nav')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#mobile-nav')).toBeHidden();
    }
  });
}
