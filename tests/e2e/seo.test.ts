import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { legalPages } from '../../src/data/legal-pages.js';
import { env } from '../../src/config/env.js';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';

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
      expect(document.documentElement.lang).toBe('en');
      expect(
        document.querySelector('.footer-bottom')?.textContent.replace(/\s+/g, ' '),
      ).toContain(
        'TikSaveMP4 is an independent service and is not affiliated with, endorsed by or sponsored by TikTok or ByteDance. TikTok is a trademark of its respective owner.',
      );
      expect(
        document.querySelector('meta[property="og:site_name"]')?.getAttribute('content'),
      ).toBe('TikSaveMP4');
      expect(response.text).not.toMatch(
        /https?:\/\/(?:localhost|127\.0\.0\.1|ttsave\.(?:com|online|test))/,
      );
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
    expect(document.title).toBe('TikSaveMP4 — Online TikTok Video Downloader');
    expect(
      document.querySelector('meta[name="description"]')?.getAttribute('content'),
    ).toBe(
      'Download available MP4 formats from supported public TikTok video links. Paste a link, review the source-provided options and choose an available quality.',
    );
    const data: unknown = JSON.parse(
      document.querySelector('script[type="application/ld+json"]')?.textContent ?? '',
    );
    expect(data).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'TikSaveMP4',
      url: env.PUBLIC_BASE_URL + '/',
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires a modern web browser',
      description:
        'A web application for processing supported public TikTok video links and downloading available MP4 formats.',
    });
    expect(JSON.stringify(data)).not.toMatch(
      /aggregateRating|review|offers|downloadCount|price/,
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
  it('does not invent an unconfigured contact channel', async () => {
    const response = await request(app).get('/contact').expect(200);
    if (!env.LEGAL_CONTACT_EMAIL && !env.PUBLIC_CONTACT_EMAIL)
      expect(response.text).toContain(
        'A public contact address has not yet been configured',
      );
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
  it('lists only public canonical pages in the sitemap', async () => {
    const response = await request(app).get('/sitemap.xml').expect(200);
    expect(response.type).toBe('application/xml');
    const document = new JSDOM(response.text, { contentType: 'application/xml' }).window
      .document;
    expect([...document.querySelectorAll('loc')].map((node) => node.textContent)).toEqual(
      ['/', '/privacy', '/terms', '/responsible-use', '/copyright'].map(
        (path) => env.PUBLIC_BASE_URL + path,
      ),
    );
    expect(response.text).not.toContain(env.PUBLIC_BASE_URL + '/contact');
    expect(response.text).not.toMatch(/api\/|jobId|token=|lastmod/);
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
