import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { tiktokToMp3Guide as post } from '../../src/data/blog/how-to-convert-tiktok-to-mp3.js';

const articlePath = '/blog/how-to-convert-tiktok-to-mp3';
const canonical = env.PUBLIC_BASE_URL + articlePath;
const supplied = readFileSync('tests/fixtures/second-blog-article.txt', 'utf8')
  .trim()
  .split(/\r?\n\s*\r?\n/)
  .map((block) => block.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'));
const textOf = (element: Element) => element.textContent.replace(/\s+/g, ' ').trim();
const app = createApp();

describe('second approved MP3 guide publication', () => {
  it('preserves every supplied heading and paragraph exactly once and in order', async () => {
    const response = await request(app).get(articlePath).expect(200);
    const document = new JSDOM(response.text).window.document;
    const article = document.querySelector('.blog-article');
    if (!article) throw new Error('Missing article');
    const actual = [
      '# ' + (article.querySelector('h1')?.textContent ?? ''),
      article.querySelector('.blog-intro > p')?.textContent.trim(),
      ...[
        ...article.querySelectorAll(
          '.blog-prose > p, .blog-prose > h2, .blog-prose > h3',
        ),
      ].map(
        (element) =>
          (element.tagName === 'H2' ? '## ' : element.tagName === 'H3' ? '### ' : '') +
          textOf(element),
      ),
    ];
    expect(actual).toEqual(supplied);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(
      [...article.querySelectorAll('.blog-prose a')].map((link) => [
        link.textContent,
        link.getAttribute('href'),
      ]),
    ).toEqual([
      ['TikSaveMP4', '/'],
      ['how to convert TikTok to MP4', '/blog/how-to-convert-tiktok-to-mp4'],
      ['TikSaveMP4', '/'],
    ]);
    expect(
      document.querySelector(
        '.blog-related a[href="/blog/how-to-convert-tiktok-to-mp4"]',
      ),
    ).not.toBeNull();
    expect(document.querySelector('#download-form')).toBeNull();
    expect(response.text).not.toContain('downloader.js');
  });
  it('emits exact metadata, genuine publication facts and matching breadcrumbs', async () => {
    const response = await request(app).get(articlePath).expect(200);
    const document = new JSDOM(response.text).window.document;
    expect(document.title).toBe('TikTok to MP3 Converter Online | TikSaveMP4');
    const description =
      'Learn how to convert TikTok to MP3 online for free. Follow simple steps to download audio from supported public TikTok videos using TikSaveMP4.';
    for (const selector of [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ])
      expect(document.querySelector(selector)?.getAttribute('content')).toBe(description);
    for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]'])
      expect(document.querySelector(selector)?.getAttribute('content')).toBe(
        document.title,
      );
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      canonical,
    );
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'index, follow',
    );
    expect(
      document.querySelector('meta[property="og:type"]')?.getAttribute('content'),
    ).toBe('article');
    expect(
      document.querySelector('meta[name="twitter:card"]')?.getAttribute('content'),
    ).toBe('summary_large_image');
    expect(
      document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
    ).toBe(env.PUBLIC_BASE_URL + post.cover.src);
    expect(
      document
        .querySelector('meta[property="article:published_time"]')
        ?.getAttribute('content'),
    ).toBe(post.publishedAt);
    expect(post.publishedAt).toBe('2026-10-20T14:35:51.169Z');
    expect(Date.parse(post.publishedAt)).toBeLessThanOrEqual(Date.now());
    const data: unknown[] = JSON.parse(
      document.querySelector('script[type="application/ld+json"]')?.textContent ?? '',
    );
    expect(data[0]).toMatchObject({
      '@type': 'BlogPosting',
      headline: post.title,
      description,
      url: canonical,
      mainEntityOfPage: canonical,
      datePublished: post.publishedAt,
      image: env.PUBLIC_BASE_URL + post.cover.src,
    });
    expect(data[0]).not.toHaveProperty('author');
    expect(data[0]).not.toHaveProperty('dateModified');
    expect(JSON.stringify(data)).not.toMatch(/aggregateRating|review|ratingValue/);
    expect(data[1]).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { position: 1, name: 'Home', item: env.PUBLIC_BASE_URL + '/' },
        { position: 2, name: 'Blog', item: env.PUBLIC_BASE_URL + '/blog' },
        { position: 3, name: post.title, item: canonical },
      ],
    });
    expect(
      document.querySelector('.blog-breadcrumbs [aria-current="page"]')?.textContent,
    ).toBe(post.title);
    await request(app)
      .get(post.cover.src)
      .expect('Content-Type', /image\/webp/)
      .expect(200);
  });
  it('is discoverable in the listing, homepage preview and sitemap without query duplicates', async () => {
    for (const path of ['/blog', '/']) {
      const response = await request(app).get(path).expect(200);
      const document = new JSDOM(response.text).window.document;
      const card = document.querySelector(`.blog-card:has(h3 a[href="${articlePath}"])`);
      expect(card?.querySelector('h3 a')?.getAttribute('href')).toBe(articlePath);
      expect(card?.querySelector('h3 a')?.textContent).toBe(post.title);
      expect(card?.querySelector('p')?.textContent.trim()).toBe(post.excerpt);
      expect(card?.querySelector('time')?.getAttribute('datetime')).toBe(
        post.publishedAt,
      );
      expect(card?.querySelector('.blog-meta span')?.textContent).toBe('MP3 Guides');
    }
    const sitemap = await request(app).get('/sitemap.xml').expect(200);
    expect(sitemap.text).toContain('<loc>' + canonical + '</loc>');
    const duplicate = await request(app)
      .get(articlePath + '?token=SECRET')
      .expect(200);
    const document = new JSDOM(duplicate.text).window.document;
    expect(duplicate.headers['x-robots-tag']).toBe('noindex, follow');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      canonical,
    );
    expect(duplicate.text).not.toContain('SECRET');
    const links = new Set(
      [
        ...new JSDOM(
          (await request(app).get(articlePath)).text,
        ).window.document.querySelectorAll('a[href]'),
      ]
        .map((link) => link.getAttribute('href') ?? '')
        .filter((href) => href.startsWith('/')),
    );
    for (const href of links)
      await request(app)
        .get(href.split('#')[0] ?? '/')
        .expect(200);
  });
});
