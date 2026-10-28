import request from 'supertest';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { blogPosts } from '../../src/data/blog-posts.js';
import { advertisingFixture } from '../helpers/advertising.js';

const original = { ...env };
const fixtures: ReturnType<typeof advertisingFixture>[] = [];
afterEach(() => {
  Object.assign(env, original);
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});
function enable(external = false) {
  const fixture = advertisingFixture();
  fixtures.push(fixture);
  env.ADVERTISING_ENABLED = true;
  env.MONETAG_IPP_ENABLED = true;
  env.MONETAG_VIGNETTE_ENABLED = true;
  const overrides = external
    ? {
        tag: { kind: 'external', src: 'https://fixture.example.org/ipp-fixture.js' },
        csp: {
          scriptSrc: ['https://fixture.example.org'],
          connectSrc: ['https://collection.example.org'],
        },
      }
    : {};
  env.MONETAG_IPP_TAG_FILE = fixture.manifest('in-page-push', overrides);
  env.MONETAG_VIGNETTE_TAG_FILE = fixture.manifest('vignette-banner');
}

describe('advertising route isolation and layout preservation', () => {
  it('keeps the entire homepage body, SEO and GA4 configuration unchanged', async () => {
    env.ADVERTISING_ENABLED = false;
    env.GA_MEASUREMENT_ID = 'G-TEST123456';
    const before = await request(createApp()).get('/').expect(200);
    enable();
    const after = await request(createApp()).get('/').expect(200);
    const baseline = new JSDOM(before.text),
      configured = new JSDOM(after.text);
    const a = baseline.window.document,
      b = configured.window.document;
    expect(b.body.innerHTML).toBe(a.body.innerHTML);
    for (const selector of [
      'title',
      'meta[name="description"]',
      'link[rel="canonical"]',
      'meta[property^="og:"]',
      'meta[name^="twitter:"]',
      'script[type="application/ld+json"]',
      '#analytics-init',
    ]) {
      expect([...b.querySelectorAll(selector)].map((el) => el.outerHTML)).toEqual(
        [...a.querySelectorAll(selector)].map((el) => el.outerHTML),
      );
    }
    expect(b.querySelectorAll('#advertising-init')).toHaveLength(1);
    expect(b.querySelector('body #advertising-init')).toBeNull();
    expect(b.querySelector('#advertising-init')?.hasAttribute('defer')).toBe(true);
    expect(b.querySelector('#advertising-init')?.outerHTML).not.toContain(
      'document.documentElement.dataset',
    );
    baseline.window.close();
    configured.window.close();
  });
  it.each(['/', '/blog', '/blog/' + (blogPosts[0]?.slug ?? '')])(
    'offers both configured formats once on %s',
    async (route) => {
      enable();
      const response = await request(createApp()).get(route).expect(200);
      const dom = new JSDOM(response.text);
      const initializer = dom.window.document.querySelector('#advertising-init');
      expect(dom.window.document.querySelectorAll('#advertising-init')).toHaveLength(1);
      const data = JSON.parse(
        initializer?.getAttribute('data-configuration') ?? 'null',
      ) as { tags: { format: string; src: string }[] };
      expect(data.tags.map((tag) => tag.format)).toEqual([
        'in-page-push',
        'vignette-banner',
      ]);
      const delivery = await request(createApp())
        .get(data.tags[0]?.src ?? '')
        .expect(200);
      expect(delivery.headers['content-type']).toContain('javascript');
      expect(delivery.headers['cross-origin-resource-policy']).toBe('same-origin');
      expect(delivery.headers['x-robots-tag']).toContain('noindex');
      expect(delivery.headers['cache-control']).toBe('private, no-store');
      dom.window.close();
    },
  );
  it.each([
    '/admin',
    '/admin/login',
    '/login',
    '/auth',
    '/api/v1/downloads',
    '/api/v1/downloads/invalid/file',
    '/api/v1/downloads/invalid/events',
    '/health',
    '/ready',
    '/privacy',
    '/terms',
    '/contact',
    '/missing',
    '/blog/missing',
    '/robots.txt',
    '/sitemap.xml',
    '/?url=PRIVATE',
    '/blog?token=PRIVATE',
  ])('excludes ads and advertising CSP origins on %s', async (route) => {
    enable(true);
    const response = await request(createApp()).get(route);
    expect(response.text).not.toMatch(
      /advertising-init|advertising\.js|fixture\.example\.org|collection\.example\.org/,
    );
    expect(response.headers['content-security-policy']).not.toMatch(
      /fixture\.example\.org|collection\.example\.org/,
    );
  });
  it('only grants reviewed, enabled-format CSP origins and retains GA4 sources', async () => {
    enable(true);
    env.GA_MEASUREMENT_ID = 'G-TEST123456';
    const response = await request(createApp()).get('/').expect(200);
    const csp = String(response.headers['content-security-policy']);
    expect(csp).toContain(
      "script-src 'self' https://www.googletagmanager.com https://fixture.example.org;",
    );
    expect(csp).toContain('https://collection.example.org');
    expect(/script-src[^;]+/.exec(csp)?.[0]).not.toMatch(
      /unsafe-inline|unsafe-eval|https:\s|\*/,
    );
    env.MONETAG_IPP_ENABLED = false;
    const off = await request(createApp()).get('/').expect(200);
    expect(off.headers['content-security-policy']).not.toContain('fixture.example.org');
  });
  it('global switch removes the initializer, tag endpoints and additional CSP permissions', async () => {
    enable(true);
    env.ADVERTISING_ENABLED = false;
    const response = await request(createApp()).get('/').expect(200);
    expect(response.text).not.toContain('advertising-init');
    expect(response.headers['content-security-policy']).not.toContain(
      'fixture.example.org',
    );
    await request(createApp())
      .get('/advertising/tags/vignette-banner/unknown.js')
      .expect(404);
  });
  it('removes advertising permissions when an otherwise eligible page fails to render', async () => {
    enable(true);
    const app = createApp();
    app.set('views', '/missing-advertising-test-view-directory');
    const response = await request(app).get('/').expect(500);
    expect(response.text).not.toContain('advertising-init');
    expect(response.headers['content-security-policy']).not.toContain(
      'fixture.example.org',
    );
    expect(response.headers['x-robots-tag']).toContain('noindex');
  });
});
