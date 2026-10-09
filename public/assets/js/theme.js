export function initializeTheme() {
  const button = document.querySelector('.theme-toggle');
  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem('tiksavemp4-theme');
  } catch {
    /* Storage can be disabled. */
  }
  const apply = (dark) => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#0d101a' : '#f8faff');
    button?.setAttribute('aria-pressed', String(dark));
    button?.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
  };
  apply(savedTheme === 'dark');
  button?.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    savedTheme = dark ? 'dark' : 'light';
    apply(dark);
    try {
      localStorage.setItem('tiksavemp4-theme', savedTheme);
    } catch {
      /* Keep theme for this page. */
    }
  });
}
