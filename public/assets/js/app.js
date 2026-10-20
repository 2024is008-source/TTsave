import { initializeTheme } from './theme.js';
import { initializeNavigation } from './navigation.js';

initializeTheme();
initializeNavigation();
// Policy/support pages share navigation and theme code, but have no downloader.
if (document.querySelector('#download-form')) {
  const { initializeDownloader } = await import('./downloader.js?v=photo-selection-6');
  initializeDownloader();
}
