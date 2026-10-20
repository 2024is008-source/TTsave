import { JSDOM } from 'jsdom';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { blogPosts } from '../../src/data/blog-posts.js';
import { legalPages } from '../../src/data/legal-pages.js';
import { createBlogRegistry } from '../../src/services/blog.js';
import { fixturePost } from '../fixtures/blog.js';

const published = createBlogRegistry(blogPosts).published;
const publicPaths = [
  '/',
  ...legalPages.map((page) => page.path),
  '/blog',
  ...published.map((post) => '/blog/' + post.slug),
];
const xmlDocument = (xml: string) =>
  new JSDOM(xml, { contentType: 'application/xml' }).window.document;

describe('complete public SEO crawl invariants', () => {
  it('contains exactly the published canonical pages, all returning indexable SSR HTML', async () => {
    const app = createApp();
    const sitemap = await request(app).get('/sitemap.xml').expect(200);
    expect(sitemap.type).toBe('application/xml');
    const xml = xmlDocument(sitemap.text);
    expect(xml.documentElement.localName).toBe('urlset');
    expect(xml.documentElement.namespaceURI).toBe(
      'http://www.sitemaps.org/schemas/sitemap/0.9',
    );
    const locations = [...xml.querySelectorAll('loc')].map((node) => node.textContent);
    expect(locations).toEqual(publicPaths.map((path) => env.PUBLIC_BASE_URL + path));
    expect(new Set(locations).size).toBe(locations.length);
    expect(xml.querySelector('lastmod,priority,changefreq')).toBeNull();
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const location of locations) {
      const url = new URL(location);
      expect(url.origin).toBe(env.PUBLIC_BASE_URL);
      expect(url.search + url.hash).toBe('');
      const response = await request(app).get(url.pathname).expect(200);
      expect(response.type).toBe('text/html');
      expect(response.headers.location).toBeUndefined();
      expect(response.headers['x-robots-tag']).toBeUndefined();
      const document = new JSDOM(response.text).window.document;
      expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        location,
      );
      expect(document.querySelectorAll('meta[name="robots"]')).toHaveLength(1);
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'index, follow',
      );
      expect(document.querySelectorAll('h1')).toHaveLength(1);
      expect(document.querySelector('main')?.textContent.trim().length).toBeGreaterThan(
        100,
      );
      expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1);
      const description =
        document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
      expect(description).not.toBe('');
      expect(titles.has(document.title)).toBe(false);
      expect(descriptions.has(description)).toBe(false);
      titles.add(document.title);
      descriptions.add(description);
    }
  });

  it('updates discovery automatically for a newly published fixture while excluding drafts and private/query URLs', async () => {
    const newPost = fixturePost('audit-published-guide');
    const draft = fixturePost('audit-draft-guide', { status: 'draft' });
    const app = createApp(undefined, () => true, [...blogPosts, newPost, draft]);
    const sitemap = await request(app).get('/sitemap.xml').expect(200);
    const locations = [...xmlDocument(sitemap.text).querySelectorAll('loc')].map(
      (node) => node.textContent,
    );
    expect(locations).toContain(env.PUBLIC_BASE_URL + '/blog/' + newPost.slug);
    expect(locations).not.toContain(env.PUBLIC_BASE_URL + '/blog/' + draft.slug);
    expect(locations).toHaveLength(publicPaths.length + 1);
    expect(
      locations.every(
        (location) =>
          !/[?#]/.test(location) &&
          !/\/(?:api|analyze|health|ready)(?:\/|$)/.test(new URL(location).pathname),
      ),
    ).toBe(true);
    const listing = await request(app).get('/blog').expect(200);
    const document = new JSDOM(listing.text).window.document;
    expect(document.querySelector(`a[href="/blog/${newPost.slug}"]`)).not.toBeNull();
    expect(document.querySelector(`a[href="/blog/${draft.slug}"]`)).toBeNull();
    await request(app)
      .get('/blog/' + draft.slug)
      .expect(404);
  });

  it('provides a crawlable anchor path from homepage to every published article and legal page without JavaScript', async () => {
    const app = createApp();
    const home = new JSDOM((await request(app).get('/').expect(200)).text).window
      .document;
    expect(home.querySelector('a[href="/blog"]')).not.toBeNull();
    expect(home.querySelector('.site-footer a[href="/blog"]')).not.toBeNull();
    for (const page of legalPages)
      expect(home.querySelector(`a[href="${page.path}"]`)).not.toBeNull();
    const listing = new JSDOM((await request(app).get('/blog').expect(200)).text).window
      .document;
    for (const post of published) {
      const path = '/blog/' + post.slug;
      expect(listing.querySelector(`.blog-card a[href="${path}"]`)).not.toBeNull();
      const document = new JSDOM((await request(app).get(path).expect(200)).text).window
        .document;
      expect(document.querySelector('.blog-prose a[href="/"]')).not.toBeNull();
      expect(
        document.querySelector('.blog-prose')?.textContent.trim().length,
      ).toBeGreaterThan(1000);
      expect(document.querySelector('script[src*="downloader.js"]')).toBeNull();
      const data: unknown[] = JSON.parse(
        document.querySelector('script[type="application/ld+json"]')?.textContent ?? '',
      );
      expect(data[0]).toMatchObject({
        '@type': 'BlogPosting',
        headline: post.title,
        datePublished: post.publishedAt,
        url: env.PUBLIC_BASE_URL + path,
        mainEntityOfPage: env.PUBLIC_BASE_URL + path,
      });
      expect(data[1]).toMatchObject({
        '@type': 'BreadcrumbList',
        itemListElement: [
          { position: 1, item: env.PUBLIC_BASE_URL + '/' },
          { position: 2, item: env.PUBLIC_BASE_URL + '/blog' },
          { position: 3, item: env.PUBLIC_BASE_URL + path },
        ],
      });
      if (!post.author) expect(data[0]).not.toHaveProperty('author');
      if (!post.modifiedAt) expect(data[0]).not.toHaveProperty('dateModified');
    }
  });

  it('reaches each canonical public URL after one application redirect with trusted TLS termination', async () => {
    const previousMode = env.NODE_ENV;
    const previousTrust = env.TRUST_PROXY;
    try {
      env.NODE_ENV = 'production';
      env.TRUST_PROXY = true;
      const app = createApp();
      for (const path of publicPaths) {
        for (const [host, protocol] of [
          ['tiksavemp4.online', 'http'],
          ['www.tiksavemp4.online', 'http'],
          ['www.tiksavemp4.online', 'https'],
        ]) {
          const response = await request(app)
            .get(path)
            .set('Host', host ?? '')
            .set('X-Forwarded-Proto', protocol ?? '')
            .expect(301);
          expect(response.headers.location).toBe(env.PUBLIC_BASE_URL + path);
          await request(app)
            .get(path)
            .set('Host', 'tiksavemp4.online')
            .set('X-Forwarded-Proto', 'https')
            .expect(200);
        }
      }
    } finally {
      env.NODE_ENV = previousMode;
      env.TRUST_PROXY = previousTrust;
    }
  });
});
