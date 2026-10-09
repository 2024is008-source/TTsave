/** Fresh per-run evidence avoids overwriting files mapped by Windows previewers. */
export const screenshotRoot =
  process.env.UI_EVIDENCE_ROOT ?? 'docs/screenshots/browser-local';
