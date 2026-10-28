import { initializeTheme } from './theme.js';
import { initializeNavigation } from './navigation.js';

try {
  initializeTheme();
  initializeNavigation();
  // Policy/support pages have no downloader.
  if (document.querySelector('#download-form')) {
    const { initializeDownloader } = await import('./downloader.js?v=tiksave-ui-1');
    if (!initializeDownloader()) throw new Error('Downloader initialization failed');
    window.tikSaveDownloaderBootstrap?.ready();
  }
} catch {
  window.tikSaveDownloaderBootstrap?.fail();
}
