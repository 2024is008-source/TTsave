/* Static page metadata and a validated external referrer origin only. No downloader hooks.
 * The GA4 stream must have Enhanced Measurement disabled; see docs/ANALYTICS.md.
 */
(() => {
  const script = document.getElementById('analytics-init');
  if (!script || window.tikSaveAnalyticsInitialized) return;
  const { measurementId, pageLocation, pageTitle } = script.dataset;
  if (!/^G-[A-Z0-9]{10}$/.test(measurementId || '') || !pageTitle) return;
  // Fail closed if the public layout's canonical metadata is ever changed incorrectly.
  if (
    !/^https:\/\/tiksavemp4\.online\/(?:privacy|terms|copyright|responsible-use|contact)?$/.test(
      pageLocation || '',
    )
  )
    return;
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
})();
