/* Consent-gated canonical page views and fixed downloader events. */
(() => {
  const script = document.getElementById('analytics-init');
  if (!script || window.tikSaveAnalyticsBound) return;
  const { measurementId, pageLocation, pageTitle } = script.dataset;
  if (!/^G-[A-Z0-9]{10}$/.test(measurementId || '') || !pageTitle) return;
  // Fail closed if the public layout's canonical metadata is ever changed incorrectly.
  if (
    !/^https:\/\/tiksavemp4\.online\/(?:privacy|terms|copyright|responsible-use|contact|blog(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?)?$/.test(
      pageLocation || '',
    )
  )
    return;

  window.tikSaveAnalyticsBound = true;
  const requireConsent = script.dataset.requireConsent === 'true';
  const key = 'ttsave-analytics-consent';
  const preference = () => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  let denied = preference() === 'denied';
  const permitted = () => !denied && (!requireConsent || preference() === 'granted');
  const banner = document.getElementById('analytics-consent');
  const setPreference = (value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };
  function initialize() {
    if (window.tikSaveAnalyticsInitialized || !permitted()) return;
    // Read once before initialization; never persist or send the original address.
    const availableReferrer = document.referrer;
    const permittedReferrerOrigin = (value) => {
      if (
        typeof value !== 'string' ||
        !value ||
        value.length > 2048 ||
        !/^https?:\/\//i.test(value) ||
        /[\s\\]/.test(value) ||
        [...value].some(
          (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        )
      )
        return '';
      try {
        const authority = /^https?:\/\/([^/?#]*)/i.exec(value)?.[1] || '';
        if (authority.includes('%')) return '';
        const url = new URL(value);
        const host = url.hostname.toLowerCase();
        const pageHost = new URL(pageLocation).hostname;
        const sensitiveParameter =
          /(?:token|auth|password|secret|signature|credential|session|job[_-]?id|analysis[_-]?id|filename|^sig$)/i;
        // Permit public-style DNS names only, never IP literals or local namespaces.
        if (
          url.username ||
          url.password ||
          url.port === '0' ||
          host.length > 253 ||
          !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host) ||
          /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion|home|lan|corp)$/.test(
            host,
          ) ||
          host === pageHost ||
          host.endsWith('.' + pageHost) ||
          host === window.location.hostname ||
          /(?:^|\.)(?:tiktok\.com|tiktokcdn\.com|tiktokcdn-us\.com|tiktokv\.com|byteoversea\.com|ibytedtos\.com|byteimg\.com|muscdn\.com)$/.test(
            host,
          )
        )
          return '';
        const keys = [
          ...url.searchParams.keys(),
          ...new URLSearchParams(url.hash.slice(1)).keys(),
        ];
        if (keys.some((key) => sensitiveParameter.test(key))) return '';
        return url.origin;
      } catch {
        return '';
      }
    };
    const pageReferrer = permittedReferrerOrigin(availableReferrer);
    window.tikSaveAnalyticsInitialized = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      send_page_view: false,
      page_location: pageLocation,
      page_title: pageTitle,
      page_referrer: pageReferrer,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: 2592000,
      cookie_update: false,
      cookie_flags: 'SameSite=Lax;Secure',
    });
    window.gtag('event', 'page_view', {
      send_to: measurementId,
      page_location: pageLocation,
      page_title: pageTitle,
      page_referrer: pageReferrer,
    });

    const eventNames = new Set([
      'metadata_request',
      'format_selected',
      'download_attempt',
      'download_prepared',
      'download_requested',
      'download_success',
      'download_failure',
      'download_cancelled',
    ]);
    window.addEventListener('ttsave:analytics', (event) => {
      if (!permitted() || !eventNames.has(event.detail?.name)) return;
      const type = ['mp4', 'mp3', 'image', 'zip'].includes(event.detail?.media_type)
        ? event.detail.media_type
        : 'unknown';
      window.gtag('event', event.detail.name, {
        send_to: measurementId,
        page_location: pageLocation,
        page_title: pageTitle,
        page_referrer: pageReferrer,
        media_type: type,
      });
    });
    if (
      !document.querySelector('script[src^="https://www.googletagmanager.com/gtag/js"]')
    ) {
      const tag = document.createElement('script');
      tag.async = true;
      tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
      tag.referrerPolicy = 'no-referrer';
      document.head.appendChild(tag);
    }
  }
  document.querySelector('[data-analytics-accept]')?.addEventListener('click', () => {
    if (!setPreference('granted')) return;
    denied = false;
    window['ga-disable-' + measurementId] = false;
    if (window.tikSaveAnalyticsInitialized)
      window.gtag('consent', 'update', {
        analytics_storage: 'granted',
        ad_storage: 'denied',
      });
    if (banner) banner.hidden = true;
    initialize();
  });
  document.querySelector('[data-analytics-decline]')?.addEventListener('click', () => {
    setPreference('denied');
    denied = true;
    window['ga-disable-' + measurementId] = true;
    if (window.tikSaveAnalyticsInitialized)
      window.gtag('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
      });
    for (const name of document.cookie
      .split(';')
      .map((value) => value.trim().split('=')[0])
      .filter((name) => /^_ga(?:_|$)/.test(name))) {
      document.cookie = name + '=;Max-Age=0;Path=/;SameSite=Lax';
      document.cookie =
        name + '=;Max-Age=0;Path=/;Domain=' + window.location.hostname + ';SameSite=Lax';
    }
    if (banner) banner.hidden = true;
  });
  document
    .querySelector('[data-analytics-preferences]')
    ?.addEventListener('click', () => {
      if (banner) banner.hidden = false;
    });
  if (banner)
    banner.hidden =
      !requireConsent || preference() === 'granted' || preference() === 'denied';
  if (preference() === 'denied') window['ga-disable-' + measurementId] = true;
  else initialize();
})();
