/* Blocking external script: apply preference before styles or body can paint. */
(() => {
  let theme = 'light';
  try {
    const saved = localStorage.getItem('tiksavemp4-theme');
    if (saved === 'dark' || saved === 'light') theme = saved;
  } catch {
    /* Storage may be disabled. */
  }
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0d101a' : '#f8faff');
})();
