import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync('public/assets/js/advertising.js', 'utf8');
const documents: JSDOM[] = [];
type AdvertisingApi = {
  setConsent: (granted: boolean) => void;
  getState: () => {
    consent: boolean;
    attemptedFormats: string[];
    requiresReload: boolean;
  };
};
function browser({
  mobile = false,
  pathname = '/blog',
  gpc = false,
  visibleHero = false,
}: { mobile?: boolean; pathname?: string; gpc?: boolean; visibleHero?: boolean } = {}) {
  vi.useFakeTimers();
  const dom = new JSDOM(
    '<head><script id="advertising-init"></script></head><body><header class="site-header"><button class="menu-toggle" aria-expanded="false">Menu</button></header><section id="hero" data-downloader-state="idle"><form id="downloader"><input id="video-url"></form></section></body>',
    {
      url: 'https://tiksavemp4.online' + pathname,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    },
  );
  documents.push(dom);
  for (const [key, value] of Object.entries({
    Date,
    setTimeout,
    clearTimeout,
    matchMedia: () => ({ matches: mobile }),
  }))
    Object.defineProperty(dom.window, key, { value, configurable: true });
  Object.defineProperty(dom.window.navigator, 'globalPrivacyControl', { value: gpc });
  const document = dom.window.document;
  const initializer = document.getElementById('advertising-init');
  if (!initializer) throw Error('Missing fixture initializer');
  initializer.dataset.configuration = JSON.stringify({
    page: pathname.split(/[?#]/)[0],
    mobileEnabled: false,
    tags: [
      {
        format: 'in-page-push',
        src: '/advertising/tags/in-page-push/fixture.js',
        attributes: {},
      },
      {
        format: 'vignette-banner',
        src: '/advertising/tags/vignette-banner/fixture.js',
        attributes: {},
      },
    ],
  });
  if (visibleHero)
    Object.defineProperty(document.getElementById('hero'), 'getBoundingClientRect', {
      value: () => ({ bottom: 400 }),
    });
  dom.window.eval(source);
  return {
    dom,
    document,
    api: Reflect.get(dom.window, 'tikSaveAdvertising') as AdvertisingApi,
    tags: () => document.querySelectorAll('script[data-ttsave-ad-format]'),
  };
}
afterEach(() => {
  for (const dom of documents.splice(0)) dom.window.close();
  vi.useRealTimers();
});

describe('consent-gated advertising loader', () => {
  it('loads nothing before separate ad consent, even with saved GA consent', async () => {
    const b = browser();
    b.dom.window.localStorage.setItem('ttsave-analytics-consent', 'granted');
    await vi.advanceTimersByTimeAsync(10000);
    expect(b.tags()).toHaveLength(0);
    b.api.setConsent(false);
    await vi.advanceTimersByTimeAsync(10000);
    expect(b.tags()).toHaveLength(0);
  });
  it('loads each format once in head despite duplicate initialization and consent events', async () => {
    const b = browser();
    b.api.setConsent(true);
    b.dom.window.eval(source);
    b.api.setConsent(true);
    await vi.advanceTimersByTimeAsync(4000);
    b.dom.window.dispatchEvent(
      new b.dom.window.CustomEvent('ttsave:advertising-consent', {
        detail: { version: 1, advertising: true },
      }),
    );
    await vi.advanceTimersByTimeAsync(4000);
    expect(b.tags()).toHaveLength(2);
    expect(
      b.document.querySelectorAll('head script[data-ttsave-ad-format]'),
    ).toHaveLength(2);
    expect(b.document.querySelector('#downloader script')).toBeNull();
    for (const tag of b.tags())
      expect(tag.getAttribute('referrerpolicy')).toBe('no-referrer');
  });
  it('defers provider loading until after the initial render', async () => {
    const b = browser();
    b.api.setConsent(true);
    await vi.advanceTimersByTimeAsync(2999);
    expect(b.tags()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1001);
    expect(b.tags()).toHaveLength(2);
  });
  it.each([
    { mobile: true },
    { gpc: true },
    { pathname: '/blog?token=SECRET' },
    { pathname: '/blog#PRIVATE' },
    { visibleHero: true },
  ])('fails closed for privacy or interaction restrictions %j', async (options) => {
    const b = browser(options);
    b.api.setConsent(true);
    await vi.advanceTimersByTimeAsync(10000);
    expect(b.tags()).toHaveLength(0);
  });
  it('protects mobile navigation and downloader input without preventing application events', async () => {
    const b = browser();
    b.api.setConsent(true);
    const input = b.document.getElementById('video-url');
    if (!input) throw Error('Missing input');
    const event = new b.dom.window.Event('focusin', { bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    await vi.advanceTimersByTimeAsync(10000);
    expect(b.tags()).toHaveLength(0);
  });
  it('does not load while a job is active, even outside the hero viewport', async () => {
    const b = browser();
    const hero = b.document.getElementById('hero');
    if (hero) hero.dataset.downloaderState = 'downloading';
    b.api.setConsent(true);
    await vi.advanceTimersByTimeAsync(10000);
    expect(b.tags()).toHaveLength(0);
  });
  it('withdrawal cancels queued tags and asks the CMP for a safe reload after a loaded tag', async () => {
    const b = browser();
    b.api.setConsent(true);
    b.api.setConsent(false);
    await vi.advanceTimersByTimeAsync(4000);
    expect(b.tags()).toHaveLength(0);
    b.api.setConsent(true);
    await vi.advanceTimersByTimeAsync(250);
    expect(b.tags()).toHaveLength(1);
    const reload = vi.fn();
    b.dom.window.addEventListener('ttsave:advertising-reload-required', reload);
    b.api.setConsent(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(b.tags()).toHaveLength(1);
    expect(reload).toHaveBeenCalledOnce();
    expect(b.api.getState().requiresReload).toBe(true);
  });
});
