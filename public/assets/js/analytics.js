/* Only static, server-rendered page metadata is passed to GA. No downloader hooks.
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
    page_referrer: '',
    ignore_referrer: true,
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
    page_referrer: '',
  });
})();
