import { JSDOM } from 'jsdom';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { blogPage, type BlogPost } from '../../src/services/blog.js';
import { fixturePost } from '../fixtures/blog.js';

const originalId = env.GA_MEASUREMENT_ID;
afterEach(() => {
  env.GA_MEASUREMENT_ID = originalId;
});
const appFor = (posts: readonly BlogPost[] = []) =>
  createApp(undefined, () => true, posts);
const documentFor = (html: string) => new JSDOM(html).window.document;

describe('public blog routes and discovery', () => {
  it('retains an honest image-free fallback for records without a supplied cover', async () => {
    const { cover, ...post } = fixturePost('image-free');
    expect(cover).toBeDefined();
    const response = await request(appFor([post]))
      .get('/blog/image-free')
      .expect(200);
    const document = documentFor(response.text);
    expect(document.querySelector('.blog-cover')).toBeNull();
    expect(
      JSON.parse(
        document.querySelector('script[type="application/ld+json"]')?.textContent ?? '',
      )[0],
    ).not.toHaveProperty('image');
    const listing = await request(appFor([post]))
      .get('/blog')
      .expect(200);
    expect(documentFor(listing.text).querySelector('.blog-card img')).toBeNull();
  });
  it('rejects article SEO metadata that duplicates an existing public page', () => {
    expect(() =>
      appFor([
        fixturePost('duplicate-title', {
          seoTitle: 'TikTok to MP4, MP3 & Image Downloader | TikSaveMP4',
        }),
      ]),
    ).toThrow('metadata must be unique');
  });
  it('renders the real empty listing with shared navigation and metadata', async () => {
    const response = await request(appFor()).get('/blog').expect(200);
    const document = documentFor(response.text);
    expect(document.title).toBe(blogPage.title);
    expect(document.querySelector('h1')?.textContent).toBe(
      'TikTok Download Guides & Tutorials',
    );
    expect(
      document.querySelector('meta[name="description"]')?.getAttribute('content'),
    ).toBe(blogPage.description);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      env.PUBLIC_BASE_URL + '/blog',
    );
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'index, follow',
    );
    expect(document.querySelectorAll('.blog-card')).toHaveLength(0);
    expect(document.querySelector('#blog-empty-title')).not.toBeNull();
    for (const selector of ['.desktop-nav', '#mobile-nav', '.site-footer'])
      expect(document.querySelector(`${selector} a[href="/blog"]`)).not.toBeNull();
    expect(document.querySelectorAll('.nav-active[href="/blog"]')).toHaveLength(2);
    expect(document.querySelector('#download-form')).toBeNull();
    expect(response.text).not.toContain('downloader.js');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    const data: unknown[] = JSON.parse(
      document.querySelector('script[type="application/ld+json"]')?.textContent ?? '',
    );
    expect(data[0]).toMatchObject({ '@type': 'Blog', blogPost: [] });
    const home = await request(appFor()).get('/').expect(200);
    expect(documentFor(home.text).querySelector('.blog-preview')).toBeNull();
  });
  it('renders articles without JavaScript, consistent social metadata and factual schema', async () => {
    const post = fixturePost('reviewed-guide', {
      modifiedAt: '2024-02-02T10:00:00Z',
      author: { name: 'Test Author' },
      relatedSlugs: ['related-guide'],
    });
    if (!post.cover) throw new Error('Expected fixture cover');
    const app = appFor([post, fixturePost('related-guide')]);
    const response = await request(app)
      .get('/blog/reviewed-guide')
      .set('Host', 'attacker.example')
      .expect(200);
    const document = documentFor(response.text);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('h1')?.textContent).toBe(post.title);
    expect(document.querySelectorAll('.blog-prose h2, .blog-prose h3')).toHaveLength(2);
    expect(document.querySelector('.blog-prose a')?.getAttribute('href')).toBe(
      '/#how-it-works',
    );
    expect(
      document.querySelector('.blog-prose p')?.textContent.replace(/\s+/g, ' ').trim(),
    ).toBe('Read the instructions.');
    expect(document.querySelector('.blog-prose ol li')?.textContent.trim()).toBe(
      'Test instruction.',
    );
    expect(document.querySelector('.blog-related a')?.getAttribute('href')).toBe(
      '/blog/related-guide',
    );
    expect(document.querySelector('.blog-cover')?.getAttribute('width')).toBe('1080');
    expect(document.title).toBe(post.seoTitle);
    for (const selector of [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ])
      expect(document.querySelector(selector)?.getAttribute('content')).toBe(
        post.description,
      );
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      env.PUBLIC_BASE_URL + '/blog/' + post.slug,
    );
    expect(
      document.querySelector('meta[property="og:type"]')?.getAttribute('content'),
    ).toBe('article');
    expect(
      document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
    ).toBe(env.PUBLIC_BASE_URL + post.cover.src);
    expect(
      document.querySelector('meta[property="og:image:alt"]')?.getAttribute('content'),
    ).toBe(post.cover.alt);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'index, follow',
    );
    const data: unknown[] = JSON.parse(
      document.querySelector('script[type="application/ld+json"]')?.textContent ?? '',
    );
    expect(data[0]).toMatchObject({
      '@type': 'BlogPosting',
      headline: post.title,
      datePublished: post.publishedAt,
      dateModified: post.modifiedAt,
      author: { '@type': 'Person', name: 'Test Author' },
    });
    expect(data[1]).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { position: 1, name: 'Home', item: env.PUBLIC_BASE_URL + '/' },
        { position: 2, name: 'Blog', item: env.PUBLIC_BASE_URL + '/blog' },
        {
          position: 3,
          name: post.title,
          item: env.PUBLIC_BASE_URL + '/blog/' + post.slug,
        },
      ],
    });
    expect(response.text).not.toContain('attacker.example');
    expect(response.text).not.toContain('downloader.js');
  });
  it('discovers all published records but no drafts; limits homepage preview to the latest three', async () => {
    const posts = [1, 2, 3, 4].map((n) =>
      fixturePost('guide-' + String(n), {
        publishedAt: `2024-01-0${String(n)}T09:00:00Z`,
      }),
    );
    const app = appFor([...posts, fixturePost('private-draft', { status: 'draft' })]);
    const listing = await request(app).get('/blog').expect(200);
    expect(documentFor(listing.text).querySelectorAll('.blog-card')).toHaveLength(4);
    const home = await request(app).get('/').expect(200);
    const document = documentFor(home.text);
    const preview = document.querySelector('.blog-preview');
    expect(
      [...document.querySelectorAll('.blog-preview h3 a')].map((link) =>
        link.getAttribute('href'),
      ),
    ).toEqual(['/blog/guide-4', '/blog/guide-3', '/blog/guide-2']);
    expect(preview?.previousElementSibling?.id).toBe('faq');
    expect(preview?.querySelector('a[href="/blog"]')?.textContent).toContain(
      'View All Guides',
    );
    const sitemap = await request(app).get('/sitemap.xml').expect(200);
    for (const post of posts)
      expect(sitemap.text).toContain(env.PUBLIC_BASE_URL + '/blog/' + post.slug);
    expect(sitemap.text).toContain('<loc>' + env.PUBLIC_BASE_URL + '/blog</loc>');
    expect(sitemap.text + listing.text + home.text).not.toContain('private-draft');
    const robots = await request(app).get('/robots.txt').expect(200);
    expect(robots.text).not.toMatch(/Disallow: \/blog|Disallow: \/assets/);
  });
  it.each([
    '/blog/missing',
    '/blog/private-draft',
    '/blog/invalid_slug',
    '/blog/nested/missing',
  ])('returns a genuine noindex 404 for %s', async (path) => {
    env.GA_MEASUREMENT_ID = 'G-TEST123456';
    const response = await request(
      appFor([fixturePost('private-draft', { status: 'draft' })]),
    )
      .get(path)
      .set('Accept', 'text/html')
      .expect(404);
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    expect(response.text).not.toContain('analytics-init');
    expect(documentFor(response.text).querySelector('link[rel="canonical"]')).toBeNull();
  });
  it('excludes query duplicates, normalizes public aliases and preserves safe GA metadata', async () => {
    env.GA_MEASUREMENT_ID = 'G-TEST123456';
    const app = appFor([fixturePost()]);
    for (const path of ['/blog', '/blog/test-video-guide']) {
      const response = await request(app)
        .get(path + '?token=SECRET')
        .expect(200);
      const document = documentFor(response.text);
      expect(response.headers['x-robots-tag']).toBe('noindex, follow');
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex, follow',
      );
      expect(
        document.querySelector('#analytics-init')?.getAttribute('data-page-location'),
      ).toBe(env.PUBLIC_BASE_URL + path);
      expect(response.text).not.toContain('SECRET');
      expect(response.headers['content-security-policy']).toContain(
        'https://www.googletagmanager.com',
      );
      const redirect = await request(app)
        .get(path.toUpperCase() + '/?token=SECRET')
        .set('Host', 'www.tiksavemp4.online')
        .expect(301);
      expect(redirect.headers.location).toBe(env.PUBLIC_BASE_URL + path);
    }
    const encoded = await request(app).get('/blog/%74est-video-guide').expect(301);
    expect(encoded.headers.location).toBe(env.PUBLIC_BASE_URL + '/blog/test-video-guide');
  });
  it('escapes article text, attributes and structured data instead of rendering arbitrary HTML', async () => {
    const attack = '</script><script>alert(1)</script>';
    const post = fixturePost('escaped', {
      title: attack,
      seoTitle: attack,
      body: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }],
        },
      ],
    });
    const response = await request(appFor([post]))
      .get('/blog/escaped')
      .expect(200);
    const document = documentFor(response.text);
    expect(document.querySelector('h1')?.textContent).toBe(attack);
    expect(document.querySelector('.blog-prose img')).toBeNull();
    expect(
      document.querySelectorAll('script:not([src]):not([type="application/ld+json"])'),
    ).toHaveLength(0);
    expect(
      () =>
        JSON.parse(
          document.querySelector('script[type="application/ld+json"]')?.textContent ?? '',
        ) as unknown,
    ).not.toThrow();
  });
});
