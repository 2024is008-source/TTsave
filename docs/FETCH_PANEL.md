# Fetching and download panel

The two supplied screenshots guide the frosted glass capsule, violet spinner,
creator header, rounded format tab, larger quality tiles and pink-to-blue download
button. All UI is HTML/EJS and locally compiled CSS; no new raster artwork is
needed for these controls.

The creator initial, title, thumbnail, duration, selected container and available
quality options come from the analysis response. No avatar photograph,
verification badge, view count, MP3 option or unavailable resolution is invented.
The current production service supplies MP4 video with audio. The format tab
identifies the selected source container; quality choices remain native radios
with keyboard navigation and visible selection text.

Fetching is indeterminate and lasts until the real API responds or is cancelled.
The existing download state machine, SSE progress and cancellation are retained.
Touch targets are at least 44px; tiles reflow into two columns on phones. Both
themes and reduced motion are supported.

Browser fixtures cover pending analysis, cancellation, source-only metadata,
keyboard quality selection, touch-target dimensions and light/dark captures.
Previews are saved under `docs/screenshots/fetching-panel-{390,1440}.png` and
`docs/screenshots/download-panel-{390,1440}.png`, with dark variants for the ready
panel. Fixture metadata is used only in automated tests.
