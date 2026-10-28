/* Monetag orchestration only. Publisher code comes exclusively from reviewed configuration. */
(() => {
  const initializer = document.getElementById('advertising-init');
  if (!initializer || window.tikSaveAdvertising) return;
  let configuration;
  try {
    configuration = JSON.parse(initializer.dataset.configuration || 'null');
  } catch {
    return;
  }
  if (!configuration || !Array.isArray(configuration.tags) || !configuration.tags.length)
    return;
  const formats = new Set(['in-page-push', 'vignette-banner']);
  const tags = configuration.tags;
  if (
    tags.length > 2 ||
    tags.some(
      (tag) =>
        !formats.has(tag.format) ||
        typeof tag.src !== 'string' ||
        !/^(?:https:\/\/|\/advertising\/tags\/)/.test(tag.src),
    )
  )
    return;
  const attempted = new Set();
  let consent = false;
  let locked = false;
  let timer;
  let blockedReason = 'consent-required';
  const notBefore = Date.now() + 3000;
  const privacySignal = () =>
    navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
  const canonicalPage = () =>
    !location.search &&
    !location.hash &&
    location.pathname === configuration.page &&
    (location.pathname === '/' ||
      /^\/blog(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(location.pathname));
  const allowed = () => {
    if (!consent || privacySignal()) return 'consent-required';
    if (!canonicalPage()) return 'noncanonical-page';
    if (locked) return 'essential-interaction';
    if (document.visibilityState === 'hidden') return 'hidden-page';
    if (!configuration.mobileEnabled && matchMedia('(max-width: 767px)').matches)
      return 'mobile-disabled';
    if (document.querySelector('.menu-toggle[aria-expanded="true"]'))
      return 'navigation-open';
    const hero = document.getElementById('hero');
    // Never start a provider while the user can see the downloader or its result controls.
    if (
      hero &&
      (hero.dataset.downloaderState !== 'idle' || hero.getBoundingClientRect().bottom > 0)
    )
      return 'downloader-visible-or-active';
    if (document.querySelector('#video-url')?.value?.trim())
      return 'download-input-present';
    if (Date.now() < notBefore) return 'initial-render';
    return '';
  };
  function schedule() {
    clearTimeout(timer);
    if (!consent || locked || attempted.size === tags.length) return;
    timer = setTimeout(loadNext, Math.max(250, notBefore - Date.now()));
  }
  function loadNext() {
    blockedReason = allowed();
    if (blockedReason) return;
    const tag = tags.find((item) => !attempted.has(item.format));
    if (!tag) return;
    // Mark before any asynchronous work: repeated consent events cannot load a zone twice.
    attempted.add(tag.format);
    const address = new URL(tag.src, location.origin).href;
    const alreadyPresent = [...document.scripts].some(
      (script) => script.src === address || script.dataset.ttsaveAdFormat === tag.format,
    );
    if (!alreadyPresent) {
      const script = document.createElement('script');
      script.async = true;
      script.src = address;
      script.setAttribute('referrerpolicy', 'no-referrer');
      script.dataset.ttsaveAdFormat = tag.format;
      for (const [name, value] of Object.entries(tag.attributes || {})) {
        if (/^data-[a-z][a-z0-9-]{0,59}$/.test(name) && typeof value === 'string')
          script.setAttribute(name, value);
      }
      // Official tags are inserted into head, never into application buttons or controls.
      document.head.appendChild(script);
    }
    schedule();
  }
  const api = Object.freeze({
    setConsent(granted) {
      consent = granted === true && !privacySignal();
      if (!consent) {
        clearTimeout(timer);
        blockedReason = 'consent-required';
        if (attempted.size)
          window.dispatchEvent(new CustomEvent('ttsave:advertising-reload-required'));
      } else schedule();
    },
    getState() {
      return {
        consent,
        attemptedFormats: [...attempted],
        blockedReason,
        requiresReload: !consent && attempted.size > 0,
      };
    },
  });
  Object.defineProperty(window, 'tikSaveAdvertising', { value: api, writable: false });
  window.addEventListener('ttsave:advertising-consent', (event) => {
    if (event.detail?.version === 1 && typeof event.detail.advertising === 'boolean')
      api.setConsent(event.detail.advertising);
  });
  // Protect essential interactions. These listeners never cancel or alter application events.
  const protect = (event) => {
    if (
      event.target instanceof Element &&
      event.target.closest('#downloader, .site-header')
    ) {
      locked = true;
      blockedReason = 'essential-interaction';
      clearTimeout(timer);
    }
  };
  for (const name of ['pointerdown', 'keydown', 'focusin', 'submit'])
    document.addEventListener(name, protect, { capture: true, passive: true });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pagehide', () => {
    consent = false;
    clearTimeout(timer);
  });
  window.dispatchEvent(new CustomEvent('ttsave:advertising-ready'));
})();
