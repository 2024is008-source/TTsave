/* Install synchronously in the head, before the form can accept interaction. */
(() => {
  if (window.tikSaveDownloaderBootstrap) return;
  let state = 'loading';
  let attempted = false;
  let timer;
  const announce = (text) => {
    const status = document.getElementById('form-status');
    if (status) status.textContent = text;
  };
  const enableGuardedForm = () => {
    if (state === 'ready') return;
    const form = document.getElementById('download-form');
    if (!form) return;
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = false;
  };
  const fail = () => {
    if (state === 'ready') return;
    state = 'failed';
    clearTimeout(timer);
    enableGuardedForm();
    document.getElementById('download-form')?.setAttribute('aria-busy', 'false');
    announce('The downloader could not start. Refresh the page and try again.');
  };
  document.addEventListener(
    'submit',
    (event) => {
      if (event.target?.id !== 'download-form') return;
      // Even a failed module must never expose an API response by native navigation.
      event.preventDefault();
      if (state === 'ready') return;
      attempted = true;
      event.stopImmediatePropagation();
      if (state === 'failed') fail();
      else {
        event.target.setAttribute('aria-busy', 'true');
        announce('The downloader is loading. Please wait a moment.');
      }
    },
    true,
  );
  document.addEventListener('readystatechange', enableGuardedForm);
  window.tikSaveDownloaderBootstrap = Object.freeze({
    ready() {
      if (state === 'ready') return;
      state = 'ready';
      clearTimeout(timer);
      enableGuardedForm();
      document.getElementById('download-form')?.setAttribute('aria-busy', 'false');
      if (attempted)
        announce('Downloader ready. Select the download button to continue.');
    },
    fail,
  });
  timer = setTimeout(fail, 15000);
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      enableGuardedForm();
    },
    { once: true },
  );
})();
