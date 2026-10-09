# Downloader correction and live verification

Verified on 2026-10-07. No automated test contacts TikTok. The separate manual
scripts use public links from the upstream yt-dlp TikTok test fixtures.

## Root causes

- The previous browser preview depended on a direct signed CDN URL, browser
  headers and CDN hotlink policy. It had no server-managed image lifecycle.
  The exact historical CDN rejection cannot be reconstructed from the supplied
  request. The replacement local authorized thumbnail returned HTTP 200 in both
  live tests, without weakening CSP.
- Analysis and download did not share an explicit Chrome impersonation setup.
  Both now use the same fixed arguments; startup verifies curl_cffi Chrome
  support alongside yt-dlp, FFmpeg and FFprobe. Real extraction and download
  processes exited successfully with this setup.
- Synthetic public format IDs were not the failure: they already mapped to real
  private extractor IDs. Tests verify the mapping survives deduplication and that
  jobs re-extract the TikTok URL instead of using expired signed URLs.
- A real test exposed an additional upstream metadata discrepancy. One source
  reported 576×1024 but delivered 540×960. The new file verifier rejected it,
  emitted a friendly error and removed its temporary files. It does not silently
  claim that the file matches the chosen resolution. The upstream extractor has
  a [540-to-576 dimension inference](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/tiktok.py#L544).

## Real results

The public `hankgreen1` video `7047596209028074758` passed:

- Analysis and authorized local WebP preview: HTTP 200.
- Selected public option: `source-1`, 576p, 576×1024, MP4 with audio.
- Real structured progress and authenticated SSE, then a completed capability.
- Actual delivered file: 2,183,224 bytes, 576×1024, 21.268005 seconds, audio stream.
- Full FFmpeg decoding: exit 0. Safe MP4 attachment: HTTP 200.
- Replay rejected: HTTP 409. Temporary server entries after disposal: none.
- Browser analysis, thumbnail, completion and explicit Save MP4 also passed.
  Browser download failure: null; job directories immediately after delivery: 0.
- Browser and HTTP deliveries have matching SHA-256:
  `63f444f662f20504fe76c8175398945e4641c1fab0d2209421907d4409904c4b`.
- The inspected frame contains a visible TikTok watermark. No clean variant was
  established for this source. TikSaveMp4 did not alter it or claim watermark removal.

The public `patroxofficial` video `6742501081818877190` also served its thumbnail.
Its reported 576p option was safely rejected for the dimension discrepancy above.
Its alternate returned option, labeled Available MP4 with unknown dimensions,
delivered 2,027,898 bytes with audio at 540×960 and decoded successfully. Its inspected
frame also contains a visible TikTok watermark. Actual quality is returned by
FFprobe in `deliveredFormat`, so the completed UI can display 540p honestly.

Machine-readable reports: `LIVE_VERIFICATION.json`, `LIVE_BROWSER_VERIFICATION.json`,
`LIVE_REJECTED_SOURCE.json`, `LIVE_ALTERNATE_SOURCE.json`. Delivered inspection copies
are `live-verification.mp4` and `live-browser-verification.mp4`; these intentional
workspace artifacts are separate from the cleaned server temporary files.

## Screenshots and checks

The five real-browser hero captures are:

- `screenshots/live-idle.png`
- `screenshots/live-ready.png`
- `screenshots/live-downloading.png`
- `screenshots/live-completed.png`
- `screenshots/live-mobile-ready.png`

The downloading capture shows genuine indeterminate progress during extraction.
Structured measured progress is verified in the live SSE report. Offline state
captures use test fixtures and are separately named `state-*.png` and `ready-*.png`.

Checks: lint, strict typecheck, 165 unit tests, 44 HTTP integration tests, build,
and 11 browser tests. Browser coverage includes 390, 768, 1024 and 1440px, keyboard
selection, cancellation, actual backend-field rendering, extra options, errors,
theme persistence and reduced motion. Startup tool checks passed all four checks.

## Changed implementation files

- Hero/templates: `views/partials/hero.ejs`, `phone-preview.ejs`, `downloader.ejs`,
  `result-card.ejs`, `progress-card.ejs`; truthful page copy in `views/index.ejs`.
- Layout: `src/styles/_result.scss`, its import in `app.scss`, compiled local CSS.
- Frontend: `src/frontend/{contracts,api-adapter,state-machine,downloader}.ts`,
  compiled browser module.
- API: `src/api/contracts.ts`, `src/routes/api.ts`, same-origin CSP in `src/app.ts`.
- Services: `src/services/{previews,extractor-options,verify-video,yt-dlp,downloader,
download-progress,tool-process,tool-check,memory-store}.ts`.
- Policy/config: `src/shared/thumbnail.ts`, `src/config/env.ts`, `.env.example`,
  `src/server.ts`, `src/check-tools.ts`, `tsconfig.json`, Sharp production dependency.
- Tests: preview security/lifecycle, extractor normalization/tool availability,
  jobs/file verification, HTTP thumbnail/progress/delivery, state/form/adapter and
  responsive browser suites. Manual helpers: `scripts/{verify-live,capture-live}.ts`.
- Operational documents: `API.md`, `ANALYSIS.md`, `DOWNLOAD_JOBS.md`,
  `DOWNLOADER_STATES.md`, `RESULT_WORKSPACE.md` and this report.

## Remaining limitations

Single process, in-memory jobs and analyses; restart loses capabilities. Only
deliverable progressive HTTPS MP4 with audio is supported. No separate-stream merge,
private video, cookies, login or region bypass is implemented. Upstream reported
dimensions can be incorrect; mismatches are refused and another quality can be
chosen. Thumbnails can fail or expire and fall back locally. File capabilities
expire after the configured window. Browser handoff cannot confirm the user saved
the file. A successful test does not guarantee every public TikTok source is
accessible. No watermark-free or quality-improvement guarantee is made.

Reference files were not modified. No Docker files or automatic commits were made.
