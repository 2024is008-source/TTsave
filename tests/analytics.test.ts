import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../src/config/env.js';

const source = readFileSync('public/assets/js/analytics.js', 'utf8');
const testId = 'G-TEST123456';

function browser(location = 'https://tiksavemp4.online/', id = testId) {
  const dom = new JSDOM(
    `<title>SECRET TikTok title</title><script id="analytics-init"></script><form><input value="SECRET TikTok URL token filename"></form>`,
    {
      url: 'https://tiksavemp4.online/?token=SECRET#signed-url',
      referrer: 'https://www.tiktok.com/@SECRET/video/123',
      runScripts: 'outside-only',
    },
  );
  const script = dom.window.document.getElementById('analytics-init');
  if (!script) throw new Error('Missing test script');
  script.dataset.measurementId = id;
  script.dataset.pageLocation = location;
  script.dataset.pageTitle = 'Static site title';
  return dom;
}

describe('optional page-view analytics', () => {
  it('validates measurement IDs and disables missing or blank values', () => {
    expect(parseEnvironment({ GA_MEASUREMENT_ID: testId }).GA_MEASUREMENT_ID).toBe(
      testId,
    );
    for (const value of [undefined, '', '   ']) {
      expect(
        parseEnvironment({ GA_MEASUREMENT_ID: value }).GA_MEASUREMENT_ID,
      ).toBeUndefined();
    }
  });
  it.each([
    'G-bad1234567',
    'UA-123456-1',
    'G-123',
    'G-TEST123456&x=1',
    '<script>',
    ' G-TEST123456',
  ])('rejects malformed ID %s', (id) => {
    expect(() => parseEnvironment({ GA_MEASUREMENT_ID: id })).toThrow(
      'Invalid environment configuration',
    );
  });
  it('queues exactly one sanitized page view and does not track form activity', () => {
    const dom = browser();
    dom.window.eval(source);
    dom.window.document
      .querySelector('input')
      ?.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    dom.window.document
      .querySelector('form')
      ?.dispatchEvent(new dom.window.Event('submit', { bubbles: true }));
    dom.window.document.querySelector('input')?.click();
    dom.window.history.pushState({}, '', '/?token=ANOTHER#secret');
    dom.window.eval(source);
    const queue = Reflect.get(dom.window, 'dataLayer') as IArguments[];
    const commands = queue.map((args) => Array.from(args) as unknown[]);
    expect(commands).toHaveLength(3);
    expect(commands[1]).toEqual([
      'config',
      testId,
      expect.objectContaining({
        send_page_view: false,
        page_location: 'https://tiksavemp4.online/',
        page_title: 'Static site title',
        page_referrer: '',
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        cookie_expires: 2592000,
        cookie_update: false,
      }),
    ]);
    expect(commands[2]).toEqual([
      'event',
      'page_view',
      {
        send_to: testId,
        page_location: 'https://tiksavemp4.online/',
        page_title: 'Static site title',
        page_referrer: '',
      },
    ]);
    expect(JSON.stringify(commands)).not.toMatch(/SECRET|ANOTHER|tiktok\.com|signed-url/);
    dom.window.close();
  });
  it.each([
    'https://attacker.test/',
    'https://tiksavemp4.online/?token=x',
    'https://tiksavemp4.online/#secret',
    'https://tiksavemp4.online/api/v1/downloads/token/file',
    'https://tiksavemp4.online/health',
    'https://tiksavemp4.online.evil.test/',
  ])('fails closed for unsafe page metadata %s', (location) => {
    const dom = browser(location);
    dom.window.eval(source);
    expect(Reflect.get(dom.window, 'dataLayer')).toBeUndefined();
    dom.window.close();
  });
  it('does nothing without the layout configuration or with a bad ID', () => {
    for (const id of ['', 'invalid']) {
      const dom = browser(undefined, id);
      dom.window.eval(source);
      expect(Reflect.get(dom.window, 'dataLayer')).toBeUndefined();
      dom.window.document.getElementById('analytics-init')?.remove();
      dom.window.eval(source);
      expect(Reflect.get(dom.window, 'dataLayer')).toBeUndefined();
      dom.window.close();
    }
  });
});
