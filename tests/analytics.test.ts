import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../src/config/env.js';

const source = readFileSync('public/assets/js/analytics.js', 'utf8');
const testId = 'G-TEST123456';

describe('consent and download events', () => {
  it('loads nothing before acceptance, emits only fixed safe fields, and stops after withdrawal', () => {
    const dom = browser();
    const { document } = dom.window;
    const init = document.getElementById('analytics-init');
    if (!init) throw Error('Missing initializer');
    init.dataset.requireConsent = 'true';
    document.body.insertAdjacentHTML(
      'beforeend',
      '<aside id="analytics-consent" hidden><button data-analytics-accept>Allow</button><button data-analytics-decline>Decline</button></aside>',
    );
    dom.window.eval(source);
    expect(Reflect.get(dom.window, 'dataLayer')).toBeUndefined();
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    const click = (selector: string) =>
      document.querySelector<HTMLButtonElement>(selector)?.click();
    click('[data-analytics-accept]');
    dom.window.eval(source);
    const emit = (name: string) =>
      dom.window.dispatchEvent(
        new dom.window.CustomEvent('ttsave:analytics', {
          detail: { name, media_type: 'mp4', url: 'SECRET', accessToken: 'SECRET' },
        }),
      );
    emit('download_success');
    emit('SECRET');
    const queue = Reflect.get(dom.window, 'dataLayer') as IArguments[];
    expect(queue).toHaveLength(4);
    expect(Array.from(queue[3] ?? [])).toEqual([
      'event',
      'download_success',
      expect.objectContaining({ media_type: 'mp4' }),
    ]);
    expect(JSON.stringify(queue)).not.toContain('SECRET');
    expect(document.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(1);
    click('[data-analytics-decline]');
    const count = queue.length;
    emit('download_success');
    expect(queue).toHaveLength(count);
    expect(Reflect.get(dom.window, `ga-disable-${testId}`)).toBe(true);
    dom.window.close();
  });
});

function browser(
  location = 'https://tiksavemp4.online/',
  id = testId,
  referrer = 'https://www.tiktok.com/@SECRET/video/123',
) {
  const dom = new JSDOM(
    `<title>SECRET TikTok title</title><script id="analytics-init"></script><form><input value="SECRET TikTok URL token filename"></form>`,
    {
      url: 'https://tiksavemp4.online/?token=SECRET#signed-url',
      runScripts: 'outside-only',
    },
  );
  // Override only the fixture so malformed addresses can exercise fail-closed handling.
  Object.defineProperty(dom.window.document, 'referrer', { value: referrer });
  const script = dom.window.document.getElementById('analytics-init');
  if (!script) throw new Error('Missing test script');
  script.dataset.measurementId = id;
  script.dataset.pageLocation = location;
  script.dataset.pageTitle = 'Static site title';
  return dom;
}

describe('optional page-view analytics', () => {
  it.each([
    ['https://www.google.com/search?q=SECRET#results', 'https://www.google.com'],
    ['https://www.bing.com/search?q=SECRET', 'https://www.bing.com'],
    [
      'https://news.example.org/story/SECRET?utm_content=SECRET',
      'https://news.example.org',
    ],
    ['HTTPS://NEWS.EXAMPLE.ORG:443/story', 'https://news.example.org'],
    ['https://news.example.org:8443/story', 'https://news.example.org:8443'],
    ['http://news.example.org:80/story', 'http://news.example.org'],
    ['', ''],
    ['not a URL', ''],
    ['//www.google.com/search', ''],
    ['javascript:alert(1)', ''],
    ['file:///SECRET', ''],
    ['https://user:SECRET@news.example.org/story', ''],
    ['https://news.example.org/?access_token=SECRET', ''],
    ['https://news.example.org/#session_id=SECRET', ''],
    ['https://news.example.org/?X-Amz-Signature=SECRET', ''],
    ['https://news.example.org/?filename=SECRET', ''],
    ['https://news.example.org/?jobId=SECRET', ''],
    ['https://localhost/story', ''],
    ['https://intranet.internal/story', ''],
    ['https://192.168.1.1/story', ''],
    ['https://127.0.0.1/story', ''],
    ['https://8.8.8.8/story', ''],
    ['https://[::1]/story', ''],
    ['https://[fc00::1]/story', ''],
    ['https://tiksavemp4.online/terms?token=SECRET', ''],
    ['https://www.tiksavemp4.online/', ''],
    ['https://preview.tiksavemp4.online/', ''],
    ['https://www.tiktok.com/@SECRET/video/123', ''],
    ['https://v16.tiktokcdn.com/SECRET', ''],
    ['https://%77ww.google.com/search', ''],
    ['https://www.google.com\\@attacker.org/', ''],
    ['https://www.google.com/\nSECRET', ''],
    ['https://news.example.org:0/', ''],
    ['https://news.example.org/' + 'x'.repeat(2048), ''],
  ])('permits only the safe origin of referrer %s', (referrer, expected) => {
    const dom = browser(undefined, undefined, referrer);
    dom.window.eval(source);
    dom.window.eval(source);
    const queue = Reflect.get(dom.window, 'dataLayer') as IArguments[];
    const commands = queue.map((args) => Array.from(args) as unknown[]);
    expect(commands).toHaveLength(3);
    expect(commands[1]?.[2]).toEqual(
      expect.objectContaining({
        send_page_view: false,
        page_referrer: expected,
        page_location: 'https://tiksavemp4.online/',
      }),
    );
    expect(commands[2]).toEqual([
      'event',
      'page_view',
      {
        send_to: testId,
        page_referrer: expected,
        page_location: 'https://tiksavemp4.online/',
        page_title: 'Static site title',
      },
    ]);
    expect(JSON.stringify(commands)).not.toMatch(
      /SECRET|ignore_referrer|session_start|campaign|"source"|"medium"|client_id|session_id|user_id/,
    );
    dom.window.close();
  });
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
  it.each([
    'https://tiksavemp4.online/blog',
    'https://tiksavemp4.online/blog/public-guide',
  ])('retains permitted referrer attribution for public blog metadata %s', (location) => {
    const dom = browser(location, testId, 'https://www.google.com/search?q=SECRET');
    dom.window.eval(source);
    const commands = (Reflect.get(dom.window, 'dataLayer') as IArguments[]).map(
      (args) => Array.from(args) as unknown[],
    );
    expect(commands[2]).toEqual([
      'event',
      'page_view',
      {
        send_to: testId,
        page_location: location,
        page_title: 'Static site title',
        page_referrer: 'https://www.google.com',
      },
    ]);
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
