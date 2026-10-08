import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { escapeXml, serializeJsonLd } from '../src/services/seo.js';
import { renderFile } from 'ejs';
import path from 'node:path';

describe('public metadata serialization', () => {
  it('escapes HTML in metadata instead of creating elements or attributes', async () => {
    const payload = '"><img src=x onerror=alert(1)>&</title><script>alert(1)</script>';
    const html = await renderFile(path.resolve('views/partials/head.ejs'), {
      seo: {
        title: payload,
        description: payload,
        canonical: 'https://tiksavemp4.online/',
        image: 'https://tiksavemp4.online/assets/og/tiksavemp4-social-card.jpg',
        robots: 'index, follow',
      },
      structuredData: null,
    });
    const document = new JSDOM(`<head>${html}</head>`).window.document;
    expect(document.title).toBe(payload);
    expect(
      document.querySelector('meta[name="description"]')?.getAttribute('content'),
    ).toBe(payload);
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('script:not([src])')).toBeNull();
  });
  it('keeps script-closing tags and separators inert while preserving valid JSON', () => {
    const payload = { description: '</script><script>alert(1)</script>&\u2028\u2029' };
    const serialized = serializeJsonLd(payload);
    const document = new JSDOM(
      `<script type="application/ld+json">${serialized}</script>`,
    ).window.document;
    expect(document.querySelectorAll('script')).toHaveLength(1);
    expect(serialized).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(document.querySelector('script')?.textContent ?? '')).toEqual(
      payload,
    );
  });
  it('XML-escapes generated URL values and round-trips them in valid XML', () => {
    const url = 'https://tiksavemp4.online/?a="quoted"&b=<tag>&c=\'value\'';
    const escaped = escapeXml(url);
    expect(escaped).toContain('&amp;');
    expect(escaped).toContain('&quot;');
    expect(escaped).toContain('&lt;');
    expect(escaped).toContain('&gt;');
    expect(escaped).toContain('&apos;');
    const document = new JSDOM(`<loc>${escaped}</loc>`, {
      contentType: 'application/xml',
    }).window.document;
    expect(document.documentElement.textContent).toBe(url);
  });
});
