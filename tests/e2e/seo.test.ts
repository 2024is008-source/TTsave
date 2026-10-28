import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { legalPages } from '../../src/data/legal-pages.js';
import { env } from '../../src/config/env.js';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import { mockData } from '../../src/data/mock-data.js';
import { faqPage, webApplication } from '../../src/services/seo.js';
import { readFile } from 'node:fs/promises';

// Evaluate the single wildcard-user-agent group emitted by this application.
// Longest matching rule wins; Allow wins ties. Supports * and terminal $.
function canCrawl(robots: string, url: string): boolean {
  const rules = robots.split('\n').flatMap((line) => {
    const match = /^(Allow|Disallow):\s*(\S+)/i.exec(line);
    if (!match?.[2]) return [];
    const pattern = match[2];
    const anchored = pattern.endsWith('$');
    const expression = (anchored ? pattern.slice(0, -1) : pattern)
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    if (!new RegExp('^' + expression + (anchored ? '$' : '')).test(url)) return [];
    return [
      {
        allow: match[1]?.toLowerCase() === 'allow',
        length: pattern.replaceAll('*', '').length,
      },
    ];
  });
  rules.sort((a, b) => b.length - a.length || Number(b.allow) - Number(a.allow));
  return rules[0]?.allow ?? true;
}

describe('public SEO and policies', () => {
  const app = createApp();
  const paths = ['/', ...legalPages.map((page) => page.path)];
  it('serves a crawlable square PNG favicon for Googlebot-Image', async () => {
    const response = await request(app)
      .get('/assets/favicon.png')
      .set('User-Agent', 'Googlebot-Image/1.0')
      .buffer(true)
      .expect(200);
    expect(response.type).toBe('image/png');
    expect(response.headers['x-robots-tag']).toBeUndefined();
    expect(await sharp(response.body as Buffer).metadata()).toMatchObject({
      width: 96,
      height: 96,
      format: 'png',
    });
    const robots = await request(app).get('/robots.txt').expect(200);
    expect(robots.text).not.toMatch(/Disallow:\s*\/assets/i);
  });
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
      expect(document.querySelectorAll('link[rel="icon"]')).toHaveLength(1);
      expect(document.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe(
        '/assets/favicon.png',
      );
      expect(document.querySelector('link[rel="icon"]')?.getAttribute('sizes')).toBe(
        '96x96',
      );
      expect(document.querySelectorAll('title')).toHaveLength(1);
      expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1);
      expect(
        document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
      ).toBe(document.title);
      expect(
        document.querySelector('meta[name="twitter:title"]')?.getAttribute('content'),
      ).toBe(document.title);
      const description = document
        .querySelector('meta[name="description"]')
        ?.getAttribute('content');
      expect(
        document
          .querySelector('meta[property="og:description"]')
          ?.getAttribute('content'),
      ).toBe(description);
      expect(
        document
          .querySelector('meta[name="twitter:description"]')
          ?.getAttribute('content'),
      ).toBe(description);
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
        path === '/' ? 'TikSaveMP4TikTokMediaUtility' : 'TikSaveMp4',
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
    expect(document.title).toBe('TikTok to MP4, MP3 & Image Downloader | TikSaveMP4');
    expect(
      document.querySelector('meta[name="description"]')?.getAttribute('content'),
    ).toBe(
      'Download public TikTok videos as MP4, convert available audio to MP3, or save photo posts as images and ZIP files. No TikTok login required.',
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
      'Download TikTok Videos & Photos',
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
  it.each(paths)(
    'keeps query variants crawlable but nonindexable for %s',
    async (path) => {
      const queryApp = createApp();
      const robots = await request(queryApp).get('/robots.txt').expect(200);
      for (const query of [
        '?utm_source=test&utm_campaign=seo&gclid=SECRET',
        '?url=https%3A%2F%2Fevil.test&title=Injected&token=SECRET',
        '?unknown=SECRET&unknown=OTHER',
        '?empty=',
      ]) {
        const response = await request(queryApp)
          .get(path + query)
          .expect(200);
        const document = new JSDOM(response.text).window.document;
        expect(canCrawl(robots.text, path + query)).toBe(true);
        expect(response.headers.location).toBeUndefined();
        expect(response.headers['x-robots-tag']).toBe('noindex, follow');
        expect(
          document.querySelector('meta[name="robots"]')?.getAttribute('content'),
        ).toBe('noindex, follow');
        expect(
          document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
        ).toBe(env.PUBLIC_BASE_URL + path);
        expect(response.text).not.toMatch(/SECRET|Injected|evil\.test|utm_campaign/);
      }
      const head = await request(queryApp)
        .head(path + '?utm_source=test')
        .expect(200);
      expect(head.headers['x-robots-tag']).toBe('noindex, follow');
      const clean = await request(queryApp).get(path).expect(200);
      expect(clean.headers['x-robots-tag']).toBeUndefined();
    },
  );
  it('matches robots rules against actual rendering assets and private resources', async () => {
    const robots = await request(app).get('/robots.txt').expect(200);
    const home = await request(app).get('/').expect(200);
    const document = new JSDOM(home.text).window.document;
    const assets = [
      ...document.querySelectorAll(
        'link[rel="stylesheet"], link[rel="icon"], script[src], img[src]',
      ),
    ]
      .map((element) => element.getAttribute('href') ?? element.getAttribute('src') ?? '')
      .filter((url) => url.startsWith('/assets/'));
    const application = await readFile('public/assets/js/app.js', 'utf8');
    for (const match of application.matchAll(
      /(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g,
    )) {
      const url = new URL(match[1] ?? '', env.PUBLIC_BASE_URL + '/assets/js/app.js');
      assets.push(url.pathname + url.search);
    }
    expect(assets.some((url) => url.includes('app.js?v='))).toBe(true);
    expect(assets.some((url) => url.includes('downloader.js?v='))).toBe(true);
    for (const url of assets) {
      expect(canCrawl(robots.text, url), url).toBe(true);
      const response = await request(app).get(url).expect(200);
      expect(response.headers['x-robots-tag']).toBeUndefined();
    }
    expect(canCrawl(robots.text, '/assets/fonts/example.woff2?v=1')).toBe(true);
    for (const url of [
      '/api/v1/analyze',
      '/api/v1/downloads/id/events',
      '/api/v1/downloads/id/file?token=SECRET',
      '/api/v1/analysis/id/photos/photo/preview?token=SECRET',
      '/health',
      '/ready',
      '/analyze',
    ])
      expect(canCrawl(robots.text, url), url).toBe(false);
    // This test must detect the original indirect blocking regression.
    expect(
      canCrawl('User-agent: *\nAllow: /\nDisallow: /*?*', '/assets/app.css?v=1'),
    ).toBe(false);
  });
  it('explains verified photo options without changing MP4 positioning or controls', async () => {
    const response = await request(app).get('/').expect(200);
    const document = new JSDOM(response.text).window.document;
    expect(document.querySelector('h1')?.textContent.replace(/\s+/g, ' ').trim()).toBe(
      'Download TikTok Videos & Photos',
    );
    expect(document.querySelector('#download-form')?.getAttribute('action')).toBe(
      '/api/v1/analyze',
    );
    expect(document.querySelector('label[for="video-url"]')?.textContent).toContain(
      'video or photo',
    );
    expect(document.querySelector('.analyze-label')?.textContent).toBe('Download Photo');
    const faq = [...document.querySelectorAll('.faq-item')].find((item) =>
      item
        .querySelector('summary')
        ?.textContent.includes('How do I use the TikTok image downloader?'),
    );
    expect(faq?.querySelector('p')?.textContent).toMatch(
      /Download image to save one individually.*For a ZIP file.*Choose images.*two or more photos.*Download selected/,
    );
    expect(faq?.querySelector('p')?.textContent).toContain(
      'Available images depend on the post.',
    );
    expect(faq?.querySelector('p')?.textContent).toContain(
      'Slideshow-to-video conversion is not supported.',
    );
    expect(
      document.querySelector('#features')?.textContent.replace(/\s+/g, ' '),
    ).toContain('TikTok photo downloader');
    const answer = faq?.querySelector('p')?.textContent ?? '';
    expect(answer).toContain('TikTok to image');
    expect(answer).toContain('download TikTok images');
    expect(answer).toContain('does not convert videos into images');
    expect(
      document.querySelector('#features')?.textContent.replace(/\s+/g, ' '),
    ).toContain('TikTok to MP4 converter');
    expect(document.querySelector('#faq')?.textContent).toContain('TikTok to MP3');
    expect(response.text).not.toMatch(/Fast download|video links only/);
    expect(response.text).toMatch(/Private, login-required/);
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
    expect(document.querySelector('.phone-scene')).toBeNull();
    expect(document.querySelectorAll('.blog-card img').length).toBeGreaterThan(0);
  });
  it('lists only public canonical pages in the sitemap', async () => {
    const response = await request(app).get('/sitemap.xml').expect(200);
    expect(response.type).toBe('application/xml');
    const document = new JSDOM(response.text, { contentType: 'application/xml' }).window
      .document;
    expect([...document.querySelectorAll('loc')].map((node) => node.textContent)).toEqual(
      [
        '/',
        ...legalPages.map((page) => page.path),
        '/blog',
        '/blog/how-to-download-tiktok-videos-on-pc',
        '/blog/how-to-download-tiktok-images',
        '/blog/how-to-convert-tiktok-to-mp3',
        '/blog/how-to-convert-tiktok-to-mp4',
      ].map((path) => env.PUBLIC_BASE_URL + path),
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
