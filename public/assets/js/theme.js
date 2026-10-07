export function initializeTheme() {
  const button = document.querySelector('.theme-toggle');
  const preference = window.matchMedia('(prefers-color-scheme: dark)');
  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem('ttsave-theme');
  } catch {
    /* Storage can be disabled. */
  }
  const apply = (dark) => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    button?.setAttribute('aria-pressed', String(dark));
    button?.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
  };
  apply(savedTheme ? savedTheme === 'dark' : preference.matches);
  preference.addEventListener('change', (event) => {
    if (!savedTheme) apply(event.matches);
  });
  button?.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    savedTheme = dark ? 'dark' : 'light';
    apply(dark);
    try {
      localStorage.setItem('ttsave-theme', savedTheme);
    } catch {
      /* Keep theme for this page. */
    }
  });
}
