import { JSDOM } from 'jsdom';
import request from 'supertest';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createApp } from '../../src/app.js';
import { blogPosts } from '../../src/data/blog-posts.js';

describe('owned responsive image delivery', () => {
  it('serves every advertised candidate at its declared pixel width', async () => {
    const app = createApp();
    const candidates = new Map<string, number>();
    for (const route of [
      '/',
      '/blog',
      ...blogPosts.map((post) => '/blog/' + post.slug),
    ]) {
      const response = await request(app).get(route).expect(200);
      const dom = new JSDOM(response.text);
      for (const element of dom.window.document.querySelectorAll('[srcset]')) {
        for (const candidate of (element.getAttribute('srcset') ?? '').split(',')) {
          const [url, descriptor] = candidate.trim().split(/\s+/);
          expect(url).toMatch(/^\/assets\/images\/[a-z0-9-]+\.webp$/);
          expect(descriptor).toMatch(/^\d+w$/);
          if (url && descriptor) candidates.set(url, Number.parseInt(descriptor));
        }
        expect(element.getAttribute('sizes')).toBeTruthy();
      }
      dom.window.close();
    }
    expect(candidates.size).toBeGreaterThanOrEqual(12);
    for (const [url, width] of candidates) {
      await request(app)
        .get(url)
        .expect(200)
        .expect('Content-Type', /image\/webp/);
      const metadata = await sharp(await readFile('public' + url)).metadata();
      expect(metadata.width).toBe(width);
    }
  });
  it('avoids raster enlargement and preserves decorative transparency', async () => {
    const source = await sharp('src/artwork/hero-video-poster.jpg').metadata();
    const generated = await sharp(
      'public/assets/images/hero-video-poster.webp',
    ).metadata();
    expect(generated.width).toBeLessThanOrEqual(source.width);
    expect(generated.height).toBeLessThanOrEqual(source.height);
    for (const name of ['showcase-left', 'showcase-right']) {
      expect((await sharp(`public/assets/images/${name}.webp`).metadata()).hasAlpha).toBe(
        true,
      );
    }
  });
  it('omits obsolete homepage artwork while retaining lazy blog covers and real form hooks', async () => {
    const response = await request(createApp()).get('/').expect(200);
    const dom = new JSDOM(response.text);
    const document = dom.window.document;
    expect(
      document.querySelector('.hero-art, .phone-scene, .showcase-decoration'),
    ).toBeNull();
    expect(document.querySelector('#download-form')?.getAttribute('action')).toBe(
      '/api/v1/analyze',
    );
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(document.querySelector('.blog-card img')?.getAttribute('loading')).toBe(
      'lazy',
    );
    dom.window.close();
  });
});
