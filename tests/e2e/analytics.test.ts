import request from 'supertest';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { legalPages } from '../../src/data/legal-pages.js';

const originalId = env.GA_MEASUREMENT_ID;
afterEach(() => {
  env.GA_MEASUREMENT_ID = originalId;
});

describe('public-page-only GA4 layout and CSP', () => {
  it.each(['/', ...legalPages.map((page) => page.path)])(
    'loads one external Google tag with safe metadata for %s',
    async (path) => {
      env.GA_MEASUREMENT_ID = 'G-TEST123456';
      const response = await request(createApp())
        .get(`${path}?url=SECRET&token=SECRET`)
        .set('Host', 'attacker.test')
        .expect(200);
      const dom = new JSDOM(response.text);
      const document = dom.window.document;
      const init = document.querySelector('#analytics-init');
      if (!init) throw new Error('Missing Analytics initializer');
      expect(init.getAttribute('src')).toBe('/assets/js/analytics.js');
      expect(init.getAttribute('data-measurement-id')).toBe(env.GA_MEASUREMENT_ID);
      expect(init.getAttribute('data-page-location')).toBe(env.PUBLIC_BASE_URL + path);
      expect(init.outerHTML).not.toMatch(/SECRET|attacker/);
      const tags = document.querySelectorAll('script[src*="googletagmanager.com"]');
      expect(tags).toHaveLength(1);
      expect(tags[0]?.getAttribute('src')).toBe(
        'https://www.googletagmanager.com/gtag/js?id=G-TEST123456',
      );
      expect(tags[0]?.getAttribute('referrerpolicy')).toBe('no-referrer');
      expect(
        document.querySelectorAll('script:not([src]):not([type="application/ld+json"])'),
      ).toHaveLength(0);
      const csp = String(response.headers['content-security-policy']);
      expect(csp).toContain("script-src 'self' https://www.googletagmanager.com;");
      expect(csp).toContain('https://*.google-analytics.com');
      expect(/script-src[^;]*/.exec(csp)?.[0]).not.toMatch(/unsafe-inline|unsafe-eval/);
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      dom.window.close();
    },
  );
  it('does not load or allow Analytics when unconfigured', async () => {
    env.GA_MEASUREMENT_ID = undefined;
    const response = await request(createApp()).get('/').expect(200);
    expect(response.text).not.toMatch(/analytics-init|gtag\/js|analytics\.js/);
    expect(response.headers['content-security-policy']).not.toMatch(
      /google-analytics|googletagmanager/,
    );
  });
  it.each([
    '/health',
    '/ready',
    '/api/v1/analyze',
    '/analyze',
    '/api/v1/downloads',
    '/api/v1/downloads/invalid',
    '/api/v1/downloads/invalid/events',
    '/api/v1/downloads/invalid/file',
    '/api/v1/analysis/invalid/thumbnail',
    '/api/v1/analysis/invalid/photos/invalid/preview',
    '/robots.txt',
    '/sitemap.xml',
    '/missing',
  ])('excludes operational, crawler and error response %s', async (path) => {
    env.GA_MEASUREMENT_ID = 'G-TEST123456';
    const response = await request(createApp()).get(path);
    expect(response.text).not.toMatch(/analytics-init|gtag\/js|analytics\.js/);
    expect(response.headers['content-security-policy']).not.toMatch(
      /google-analytics|googletagmanager/,
    );
  });
  it('keeps creation responses and canonical redirects free of Analytics', async () => {
    env.GA_MEASUREMENT_ID = 'G-TEST123456';
    const app = createApp();
    for (const path of ['/api/v1/analyze', '/api/v1/downloads', '/analyze']) {
      const response = await request(app).post(path).send({ url: 'SECRET' });
      expect(response.text).not.toMatch(/analytics-init|gtag\/js/);
      expect(response.headers['content-security-policy']).not.toMatch(
        /google-analytics|googletagmanager/,
      );
    }
    const response = await request(app).get('/privacy/').expect(301);
    expect(response.headers['content-security-policy']).not.toMatch(
      /google-analytics|googletagmanager/,
    );
  });
});
