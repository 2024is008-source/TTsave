/// <reference lib="dom" />
import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

const articlePath = '/blog/how-to-convert-tiktok-to-mp3';
const title = 'How to Convert TikTok to MP3 Online: The Full Guide';

for (const width of [390, 768, 1440]) {
  test(`approved guide and homepage preview at ${String(width)}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const preview = page.locator('.blog-preview');
    await expect(preview.locator('.blog-card')).toHaveCount(3);
    await expect(preview.getByRole('heading', { name: title })).toBeVisible();
    await preview.getByRole('link', { name: title, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(articlePath + '$'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.locator('.blog-cover')).toHaveAttribute(
      'alt',
      'Concept artwork of a silver phone, headphones and a glass MP3 file connected by a luminous audio waveform',
    );
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark')
        await page.getByRole('button', { name: 'Switch to dark theme' }).click();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`second-guide-${String(width)}-${theme}.png`),
        fullPage: true,
      });
    }
    await page.locator('.blog-breadcrumbs a[href="/blog"]').click();
    await expect(page.locator(`.blog-card h3 a[href="${articlePath}"]`)).toHaveText(
      title,
    );
  });
}

test('approved article is readable without JavaScript or the downloader bundle', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const response = await page.goto('http://127.0.0.1:3100' + articlePath);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  await expect(
    page.getByRole('heading', { name: 'Step 5: Download the MP3 File' }),
  ).toBeVisible();
  await expect(page.locator('.blog-prose')).toContainText(
    "If you'd like to try this method",
  );
  await expect(page.locator('script[src*="downloader.js"]')).toHaveCount(0);
  await context.close();
});
