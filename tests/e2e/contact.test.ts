import request from 'supertest';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { env, parseEnvironment } from '../../src/config/env.js';
import { legalPages } from '../../src/data/legal-pages.js';

const savedPublic = env.PUBLIC_CONTACT_EMAIL;
const savedLegal = env.LEGAL_CONTACT_EMAIL;
afterEach(() => {
  env.PUBLIC_CONTACT_EMAIL = savedPublic;
  env.LEGAL_CONTACT_EMAIL = savedLegal;
});

describe('official shared public contact', () => {
  it.each(['/', ...legalPages.map((page) => page.path)])(
    'renders the correct shared contact where applicable on %s',
    async (path) => {
      const defaults = parseEnvironment({});
      env.PUBLIC_CONTACT_EMAIL = defaults.PUBLIC_CONTACT_EMAIL;
      env.LEGAL_CONTACT_EMAIL = defaults.LEGAL_CONTACT_EMAIL;
      const response = await request(createApp()).get(path).expect(200);
      const dom = new JSDOM(response.text);
      const links = dom.window.document.querySelectorAll('a[href^="mailto:"]');
      expect(links).toHaveLength(path === '/' ? 0 : 1);
      for (const link of links) {
        expect(link.textContent).toBe('tiksavemp4@gmail.com');
        expect(link.getAttribute('href')).toBe('mailto:tiksavemp4@gmail.com');
      }
      // Construct the retired value so the obsolete address is not retained in source.
      const retired = ['back', 'bencherz', '2027', '@gmail.com'].join('');
      expect(response.text.toLowerCase()).not.toContain(retired);
      const document = dom.window.document;
      for (const selector of [
        'title',
        'meta',
        'link[rel="canonical"]',
        'script[type="application/ld+json"]',
      ]) {
        for (const element of document.querySelectorAll(selector))
          expect(element.outerHTML).not.toContain('tiksavemp4@gmail.com');
      }
      dom.window.close();
    },
  );
  it.each([
    {
      values: { PUBLIC_CONTACT_EMAIL: 'support@example.test' },
      expected: 'support@example.test',
    },
    {
      values: {
        PUBLIC_CONTACT_EMAIL: 'support@example.test',
        LEGAL_CONTACT_EMAIL: 'legal@example.test',
      },
      expected: 'legal@example.test',
    },
    {
      values: { LEGAL_CONTACT_EMAIL: 'legal@example.test' },
      expected: 'legal@example.test',
    },
  ])(
    'preserves server configuration precedence: $expected',
    async ({ values, expected }) => {
      const parsed = parseEnvironment(values);
      env.PUBLIC_CONTACT_EMAIL = parsed.PUBLIC_CONTACT_EMAIL;
      env.LEGAL_CONTACT_EMAIL = parsed.LEGAL_CONTACT_EMAIL;
      const response = await request(createApp())
        .get('/contact?email=attacker@example.test')
        .expect(200);
      const dom = new JSDOM(response.text);
      const link = dom.window.document.querySelector('a[href^="mailto:"]');
      expect(link?.textContent).toBe(expected);
      expect(link?.getAttribute('href')).toBe(`mailto:${expected}`);
      expect(response.text).not.toContain('attacker@example.test');
      dom.window.close();
    },
  );
});
