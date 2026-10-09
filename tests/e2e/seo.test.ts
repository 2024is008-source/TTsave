import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { legalPages } from '../../src/data/legal-pages.js';
import { env } from '../../src/config/env.js';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import { mockData } from '../../src/data/mock-data.js';
import { faqPage, webApplication } from '../../src/services/seo.js';

describe('public SEO and policies', () => {
  const app = createApp();
  const paths = ['/', ...legalPages.map((page) => page.path)];
  it('serves a small local 1200x630 JPEG social preview', async () => {
    const response = await request(app)
      .get('/assets/og/tiksavemp4-social-card.jpg')
      .buffer(true)
      .expect(200);
    expect(response.type).toBe('image/jpeg');
    const bytes = response.body as Buffer;
    expect(bytes.length).toBeLessThan(200_000);
    expect(await sharp(bytes).metadata()).toMatchObject({
      width: 1200,
      height: 630,
      format: 'jpeg',
    });
  });
  it.each(paths)(
    'renders canonical public metadata and safe navigation for %s',
    async (path) => {
      const response = await request(app)
        .get(path)
        .set('Host', 'attacker.test')
        .set('X-Forwarded-Host', 'attacker.test')
        .expect(200);
      const document = new JSDOM(response.text).window.document;
      expect(document.querySelectorAll('title')).toHaveLength(1);
      expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1);
      expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
      expect(document.querySelector('meta[name="keywords"]')).toBeNull();
      expect(
        document.querySelector('meta[property="og:locale"]')?.getAttribute('content'),
      ).toBe('en_US');
      for (const selector of [
        'meta[property="og:url"]',
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
      ]) {
        const url = new URL(
          document.querySelector(selector)?.getAttribute('content') ?? '',
        );
        expect(url.origin).toBe(env.PUBLIC_BASE_URL);
        expect(url.search).toBe('');
      }
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        env.PUBLIC_BASE_URL + path,
      );
      expect(
        document.querySelector('meta[property="og:url"]')?.getAttribute('content'),
      ).toBe(env.PUBLIC_BASE_URL + path);
      expect(
        document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
      ).toBe(env.PUBLIC_BASE_URL + '/assets/og/tiksavemp4-social-card.jpg');
      expect(
        document.querySelector('meta[name="twitter:card"]')?.getAttribute('content'),
      ).toBe('summary_large_image');
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'index, follow',
      );
      expect(document.querySelectorAll('h1')).toHaveLength(1);
      expect(
        document.querySelectorAll('script:not([src]):not([type="application/ld+json"])'),
      ).toHaveLength(0);
      expect(
        document.querySelectorAll('script[type="application/ld+json"]'),
      ).toHaveLength(path === '/' ? 1 : 0);
      expect(document.documentElement.lang).toBe('en-US');
      for (const previousBrand of [['TT', 'Save'].join('')]) {
        expect(response.text).not.toContain(previousBrand);
      }
      expect(document.querySelector('.wordmark')?.textContent.replace(/\s+/g, '')).toBe(
        'TikSaveMp4',
      );
      expect(
        document.querySelector('.footer-bottom')?.textContent.replace(/\s+/g, ' '),
      ).toContain(
        'TikSaveMp4 is an independent service and is not affiliated with, endorsed by or sponsored by TikTok or ByteDance. TikTok is a trademark of its respective owner.',
      );
      expect(
        document.querySelector('meta[property="og:site_name"]')?.getAttribute('content'),
      ).toBe('TikSaveMp4');
      expect(response.text).not.toMatch(/https?:\/\/(?:localhost|127\.0\.0\.1)/);
      expect(response.headers['content-security-policy']).toContain("img-src 'self'");
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      for (const target of legalPages)
        expect(document.querySelector(`a[href="${target.path}"]`)).not.toBeNull();
      if (path !== '/') {
        expect(
          document.querySelector('.legal-note')?.textContent.replace(/\s+/g, ' '),
        ).toContain('reviewed for the applicable jurisdiction');
        expect(document.querySelector('a[href="/#downloader"]')).not.toBeNull();
        expect(response.text).not.toContain('id="download-form"');
      }
    },
  );
  it('uses exact homepage copy and valid factual WebApplication data', async () => {
    const response = await request(app).get('/').expect(200);
    const document = new JSDOM(response.text).window.document;
    expect(document.title).toBe(
      'TikTok Downloader – Download MP4, MP3 & Photos | TikSaveMP4',
    );
    expect(
      document.querySelector('meta[name="description"]')?.getAttribute('content'),
    ).toBe(
      'Download supported public TikTok videos as MP4, convert available audio to MP3, or save photos from supported image posts. Available options depend on the source.',
    );
    const data: unknown = JSON.parse(
      document.querySelector('script[type="application/ld+json"]')?.textContent ?? '',
    );
    expect(data).toEqual([webApplication(env.PUBLIC_BASE_URL), faqPage(mockData.faqs)]);
    expect(webApplication(env.PUBLIC_BASE_URL)).toMatchObject({
      '@type': 'WebApplication',
      operatingSystem: 'Web-based',
      inLanguage: 'en-US',
    });
    const visibleFaqs = [...document.querySelectorAll('.faq-item')].map((item) => ({
      question: item
        .querySelector('summary')
        ?.textContent.replace(/\+\s*$/, '')
        .trim(),
      answer: item.querySelector('p')?.textContent.trim(),
    }));
    expect(visibleFaqs).toEqual(mockData.faqs);
    expect(document.querySelector('h1')?.textContent.replace(/\s+/g, ' ').trim()).toBe(
      'TikTok to MP4 Downloader',
    );
    expect(JSON.stringify(data)).not.toMatch(
      /"(?:aggregateRating|review|offers|downloadCount|price)"\s*:/,
    );
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
  });
  it('has unique titles and descriptions on all public pages', async () => {
    const titles: string[] = [];
    const descriptions: (string | null | undefined)[] = [];
    for (const path of paths) {
      const response = await request(app).get(path).expect(200);
      const document = new JSDOM(response.text).window.document;
      titles.push(document.title);
      descriptions.push(
        document.querySelector('meta[name="description"]')?.getAttribute('content'),
      );
    }
    expect(new Set(titles).size).toBe(paths.length);
    expect(new Set(descriptions).size).toBe(paths.length);
  });
  it('redirects only the known www alias for public pages without reflecting query secrets', async () => {
    const response = await request(app)
      .get('/privacy?token=secret')
      .set('Host', 'www.tiksavemp4.online')
      .expect(301);
    expect(response.headers.location).toBe(env.PUBLIC_BASE_URL + '/privacy');
    const api = await request(app)
      .get('/health')
      .set('Host', 'www.tiksavemp4.online')
      .expect(200);
    expect(api.headers.location).toBeUndefined();
    await request(app)
      .get('/')
      .set('Host', 'www.tiksavemp4.online.evil.test')
      .expect(200);
  });
  it('renders the configured contact channel including the official fallback', async () => {
    const response = await request(app).get('/contact').expect(200);
    const document = new JSDOM(response.text).window.document;
    const address = env.LEGAL_CONTACT_EMAIL ?? env.PUBLIC_CONTACT_EMAIL;
    const link = document.querySelector(`a[href="mailto:${address}"]`);
    expect(link?.textContent).toBe(address);
  });
  it('excludes query variants from indexing and ignores untrusted query values', async () => {
    const response = await request(app)
      .get('/?url=https://evil.test&title=Injected')
      .expect(200);
    expect(response.headers['x-robots-tag']).toBe('noindex, follow');
    expect(response.text).toContain('content="noindex, follow"');
    expect(response.text).not.toContain('https://evil.test');
  });
  it('redirects public trailing slashes to the canonical clean URL', async () => {
    const response = await request(app).get('/privacy/?token=secret').expect(301);
    expect(response.headers.location).toBe(env.PUBLIC_BASE_URL + '/privacy');
  });
  it.each(['/PRIVACY', '/Privacy/', '/ROBOTS.TXT/', '/SITEMAP.XML'])(
    'normalizes duplicate public route %s in one redirect',
    async (path) => {
      const response = await request(app)
        .get(path + '?utm_source=test')
        .set('Host', 'www.tiksavemp4.online')
        .expect(301);
      expect(response.headers.location).toBe(
        env.PUBLIC_BASE_URL + path.toLowerCase().replace(/\/$/, ''),
      );
    },
  );
  it('enforces HTTPS for production public hosts with a fixed destination and supports trusted TLS termination', async () => {
    const originalMode = env.NODE_ENV;
    const originalTrust = env.TRUST_PROXY;
    try {
      env.NODE_ENV = 'production';
      const insecure = await request(app)
        .get('/PRIVACY/?utm_source=test')
        .set('Host', 'tiksavemp4.online')
        .set('X-Forwarded-Proto', 'https')
        .expect(301);
      expect(insecure.headers.location).toBe(env.PUBLIC_BASE_URL + '/privacy');
      env.TRUST_PROXY = true;
      const behindTrustedEdge = createApp();
      await request(behindTrustedEdge)
        .get('/privacy')
        .set('Host', 'tiksavemp4.online')
        .set('X-Forwarded-Proto', 'https')
        .expect(200);
      const alias = await request(behindTrustedEdge)
        .get('/PRIVACY/')
        .set('Host', 'www.tiksavemp4.online')
        .set('X-Forwarded-Proto', 'http')
        .expect(301);
      expect(alias.headers.location).toBe(env.PUBLIC_BASE_URL + '/privacy');
    } finally {
      env.NODE_ENV = originalMode;
      env.TRUST_PROXY = originalTrust;
    }
  });
  it('serves an accessible HTML 404 to browser visitors while API errors stay JSON', async () => {
    const response = await request(app)
      .get('/not-a-page?title=Injected')
      .set('Accept', 'text/html')
      .expect(404);
    expect(response.type).toBe('text/html');
    const document = new JSDOM(response.text).window.document;
    expect(document.querySelector('h1')?.textContent).toBe('Page not found');
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(response.text).not.toContain('Injected');
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    const api = await request(app)
      .get('/api/v1/missing')
      .set('Accept', 'text/html')
      .expect(404);
    expect(api.type).toBe('application/json');
  });
  it('keeps rendered internal links reachable, including fragment targets', async () => {
    const response = await request(app).get('/');
    const document = new JSDOM(response.text).window.document;
    const links = new Set(
      [...document.querySelectorAll('a[href]')].map(
        (link) => link.getAttribute('href') ?? '',
      ),
    );
    for (const link of links) {
      if (link.startsWith('#'))
        expect(document.getElementById(link.slice(1))).not.toBeNull();
      else if (link.startsWith('/'))
        await request(app)
          .get(link.split('#')[0] ?? '/')
          .expect(200);
    }
  });
  it('keeps static assets cached briefly with validators and reserves image dimensions', async () => {
    const response = await request(app)
      .get('/assets/og/tiksavemp4-social-card.jpg')
      .expect(200);
    expect(response.headers['cache-control']).toBe('public, max-age=3600');
    expect(response.headers.etag).toBeTruthy();
    await request(app)
      .get('/assets/og/tiksavemp4-social-card.jpg')
      .set('If-None-Match', String(response.headers.etag))
      .expect(304);
    const home = await request(app).get('/');
    const document = new JSDOM(home.text).window.document;
    for (const image of document.querySelectorAll('picture img')) {
      expect(image.getAttribute('width')).toMatch(/^\d+$/);
      expect(image.getAttribute('height')).toMatch(/^\d+$/);
      expect(image.hasAttribute('alt')).toBe(true);
    }
    expect(document.querySelector('.phone-scene img')?.getAttribute('loading')).toBe(
      'eager',
    );
  });
  it('lists only public canonical pages in the sitemap', async () => {
    const response = await request(app).get('/sitemap.xml').expect(200);
    expect(response.type).toBe('application/xml');
    const document = new JSDOM(response.text, { contentType: 'application/xml' }).window
      .document;
    expect([...document.querySelectorAll('loc')].map((node) => node.textContent)).toEqual(
      ['/', ...legalPages.map((page) => page.path)].map(
        (path) => env.PUBLIC_BASE_URL + path,
      ),
    );
    expect(response.text).not.toMatch(
      /api\/|jobId|token=|lastmod|health|ready|analyze|changefreq|priority/,
    );
  });
  it('publishes crawler exclusions with a canonical sitemap', async () => {
    const response = await request(app).get('/robots.txt').expect(200);
    expect(response.type).toBe('text/plain');
    for (const path of ['/api/', '/health', '/ready', '/analyze'])
      expect(response.text).toContain(`Disallow: ${path}`);
    expect(response.text).toContain(`Sitemap: ${env.PUBLIC_BASE_URL}/sitemap.xml`);
  });
  it.each([
    '/health',
    '/HEALTH',
    '/ready',
    '/api/v1/downloads/not-a-job',
    '/api/v1/analysis/not-an-id/thumbnail',
    '/missing',
  ])('prevents indexing and caching of %s', async (path) => {
    const response = await request(app).get(path);
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('prevents indexing of legacy and API validation errors', async () => {
    for (const path of ['/analyze', '/api/v1/analyze', '/api/v1/downloads']) {
      const response = await request(app).post(path).send({}).expect(400);
      expect(response.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
      expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    }
  });
});
