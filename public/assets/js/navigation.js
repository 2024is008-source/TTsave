export function initializeNavigation() {
  const button = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('#mobile-nav');
  const close = () => {
    navigation.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Open navigation');
  };
  button?.addEventListener('click', () => {
    navigation.hidden = !navigation.hidden;
    button.setAttribute('aria-expanded', String(!navigation.hidden));
    button.setAttribute(
      'aria-label',
      navigation.hidden ? 'Open navigation' : 'Close navigation',
    );
  });
  navigation
    ?.querySelectorAll('a')
    .forEach((link) => link.addEventListener('click', close));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !navigation.hidden) {
      close();
      button.focus();
    }
  });
  document.querySelectorAll('a[href="#downloader"]').forEach((link) => {
    link.addEventListener('click', () =>
      document.querySelector('#video-url')?.focus({ preventScroll: true }),
    );
  });
}
