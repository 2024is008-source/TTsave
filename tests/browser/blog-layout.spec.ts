/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

const guides = [
  '/blog/how-to-convert-tiktok-to-mp4',
  '/blog/how-to-convert-tiktok-to-mp3',
  '/blog/how-to-download-tiktok-images',
  '/blog/how-to-download-tiktok-videos-on-pc',
];

for (const width of [390, 768, 1024, 1440]) {
  test(`consistent blog cards and readable articles at ${String(width)}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const path of ['/', '/blog']) {
      await page.goto(path);
      const cards = page.locator(
        path === '/' ? '.blog-preview .blog-card' : '.blog-card',
      );
      await expect(cards.locator('h3 a')).toHaveCount(path === '/' ? 3 : 4);
      expect(
        await cards
          .locator('h3 a')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href'))),
      ).toEqual(path === '/' ? guides.slice(0, 3) : guides);
      for (const image of await cards.locator('img').all()) {
        await image.scrollIntoViewIfNeeded();
        await expect(image).toHaveJSProperty('complete', true);
        await expect
          .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
          .toBeGreaterThan(0);
      }
      const bounds = await cards.evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          const title = node.querySelector('h3');
          const paragraph = node.querySelector('p');
          const link = node.querySelector('.blog-link');
          if (!title || !paragraph || !link) throw new Error('Incomplete card');
          const style = getComputedStyle(paragraph);
          return {
            y: rect.y,
            height: rect.height,
            title: title.getBoundingClientRect().y,
            paragraph: paragraph.getBoundingClientRect().y,
            link: link.getBoundingClientRect().y,
            font: parseFloat(style.fontSize),
            summaryHeight: paragraph.getBoundingClientRect().height,
            summaryContentHeight: paragraph.scrollHeight,
          };
        }),
      );
      for (const card of bounds) {
        expect(card.font).toBeGreaterThanOrEqual(16);
        expect(card.summaryContentHeight).toBeLessThanOrEqual(card.summaryHeight + 1);
        expect(
          Math.max(...bounds.map((item) => item.height)) -
            Math.min(...bounds.map((item) => item.height)),
        ).toBeLessThanOrEqual(2);
        const row = bounds.filter((other) => Math.abs(other.y - card.y) < 2);
        for (const key of ['height', 'title', 'paragraph', 'link'] as const)
          expect(
            Math.max(...row.map((item) => item[key])) -
              Math.min(...row.map((item) => item[key])),
          ).toBeLessThanOrEqual(2);
      }
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({
        path: testInfo.outputPath(
          `${path === '/' ? 'preview' : 'listing'}-${String(width)}.png`,
        ),
        fullPage: true,
      });
    }
    for (const path of guides) {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('.blog-cover')).toBeVisible();
      const metrics = await page
        .locator('.blog-prose > p')
        .first()
        .evaluate((node) => {
          const style = getComputedStyle(node);
          return {
            font: parseFloat(style.fontSize),
            lineHeight: parseFloat(style.lineHeight),
            width: node.getBoundingClientRect().width,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
      expect(metrics.font).toBeGreaterThanOrEqual(16);
      expect(metrics.font).toBeLessThanOrEqual(18);
      expect(metrics.lineHeight / metrics.font).toBeGreaterThanOrEqual(1.7);
      expect(metrics.width).toBeLessThanOrEqual(760);
      expect(metrics.overflow).toBe(false);
    }
  });
}
