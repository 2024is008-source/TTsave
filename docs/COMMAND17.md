# Command 17 implementation audit

Before editing: theme initialization uses OS dark mode when storage is empty; MP4 has a fixed name and MP3 has an ASCII-only name. Analysis and frontend schemas require video formats. Production jobs already enforce bounded concurrency, expiring capabilities, single-use delivery and guarded temporary cleanup. Thumbnail delivery uses server-held CDN URLs. The mobile resolver pins validated public DNS addresses and checks every redirect.

Changes: render-blocking external theme initialization; shared server filename and Content-Disposition generation; a separate bounded public-photo metadata path; opaque photo selections and analysis authorization; verified image delivery through existing jobs; an accessible gallery inside the current workspace. Keep video behavior and existing rate/concurrency limits.

Limits: at most 35 ordered unique photos, 2 MiB public page metadata, 12 MiB image bytes, 40 million decoded pixels, two image redirects, 2 second connection/header limits and 8 second total upstream budget. JPEG, PNG and WebP only. Photo MP3 is unavailable.

## Implemented behavior

Theme priority is a valid saved `dark`/`light` preference, then light. The external blocking `theme-init.js` runs before CSS/body rendering; the accessible toggle persists explicit selections and updates `theme-color`. OS dark preference does not set the initial theme.

Filename labels come only from normalized server metadata. They retain Unicode letters, numbers and marks, remove hashtag noise, control/bidi/invisible characters and filesystem separators, collapse punctuation, guard Windows device names and cap the title stem at 160 UTF-8 bytes. Images append their one-based sequence number. Empty titles have deterministic `tiktok-video`, `tiktok-audio` and `tiktok-photo-01` fallbacks. Delivery uses quoted ASCII `filename` plus RFC 5987 UTF-8 `filename*`. Temporary paths remain fixed server-owned names.

The analyzer accepts the same five exact TikTok hosts and HTTPS authority restrictions, with `/photo/{id}` added alongside `/video/{id}` and mobile short codes. The mobile resolver still validates/pins every hop and allows at most three redirects. Public photo hydration must contain the matching post ID, supported image metadata and no private/friends-only flags. Universal hydration additionally requires status zero. A `/photo/` page may fall back to the same public `/video/` representation of that exact ID, within one eight-second budget. Video-path posts can become photos only after actual image metadata is verified. Private/login/region/source-rate-limit extractor failures do not use this fallback.

## API and authorization

- `POST /api/v1/analyze` adds `postType`, `photos`, `capability` and `capabilities.images` for photos. Photos contain only UUID IDs, ordered positions and local capability preview URLs. Photo-only results have empty `formats`, `mp4: false` and `mp3: false`.
- `GET /api/v1/analysis/:analysisId/photos/:photoId/preview?token=...` checks that the photo belongs to the valid, unexpired analysis token. Default analysis expiry remains ten minutes.
- `POST /api/v1/downloads` accepts a strict image intent: `{analysisId, photoId, capability, downloadType: "image"}`. Arbitrary URLs, titles, filenames and extra properties are rejected.
- Image jobs reuse existing creation limits, application/download concurrency, authorized status/SSE/cancellation and single-use file delivery. Default prepared-file access remains sixty seconds. Server-held signed CDN addresses are never included in JSON, headers, redirects or logs.

Both image fetch paths allow only explicit TikTok CDN domain families, validate every redirect and all DNS answers, reject nonpublic IPv4/IPv6 destinations and create a fresh TLS connection pinned to a validated IP. Only fixed application headers are sent. Response bodies are bounded in memory to 12 MiB; jobs write verified bytes to guarded temporary storage. MIME, signature, decoder format/pixel limit and complete image decoding must agree. JPEG remains `.jpg`, PNG `.png` and WebP `.webp`; no conversion or upscaling occurs. SVG, HTML, JSON, executable and animated/multipage content are rejected. Delivery and previews use `private, no-store` and `nosniff`. Abort, expiry and failure close upstream requests and reuse existing job cleanup.

## Gallery

The gallery occupies the existing result workspace and uses its gradient/glass controls. It selects the first photo, supports every thumbnail, Previous/Next and arrow keys, announces position, lazy-loads thumbnails and preserves the natural image content. Individual preview failures show a safe placeholder without disabling other images. Failed retries keep the selection, a new analysis clears all photos, and completed downloads can return to another image in the same analysis. No invented quality/progress, ZIP or photo MP3 controls are added. Responsible-use language covers public posts, permission and reuse rights.

## Changed files

- Theme: `public/assets/js/theme-init.js`, `public/assets/js/theme.js`, `views/partials/head.ejs`.
- Metadata/security: `src/services/photo-metadata.ts`, `src/services/photo-images.ts`, `src/services/public-fetch.ts`, `src/services/yt-dlp.ts`, `src/services/tiktok-link.ts`, `src/shared/video-url.ts`, `src/shared/thumbnail.ts`.
- Contracts/jobs/routes/filenames: `src/api/contracts.ts`, `src/services/downloader.ts`, `src/services/memory-store.ts`, `src/services/filename.ts`, `src/services/mp3.ts`, `src/routes/api.ts`, `src/app.ts`.
- Frontend: `src/frontend/contracts.ts`, `src/frontend/api-adapter.ts`, `src/frontend/state-machine.ts`, `src/frontend/downloader.ts`, `src/frontend/photo-gallery.ts`, `views/partials/result-card.ejs`, `views/partials/photo-gallery.ejs`, `src/styles/app.scss`, `src/styles/_photos.scss`, rebuilt `public/assets/js/downloader.js`.
- Responsible-use scope: `src/data/legal-pages.ts`.
- Tests: new `tests/filename.test.ts`, `tests/photo-metadata.test.ts`, `tests/photo-analyzer.test.ts`, `tests/photo-images.test.ts`, `tests/photo-state.test.ts`, `tests/e2e/photos.test.ts` and `tests/browser/photos.spec.ts`; updated `tests/mp3.test.ts`, `tests/e2e/downloads.test.ts`, `tests/e2e/mp3.test.ts` and `tests/yt-dlp.test.ts`.
- Report and new screenshots: this file and `docs/screenshots/command17/verified/`.

## Verification

Validation used Node.js 24.18.0. Final results: lint and strict typecheck passed; 326 unit tests across 18 files and 99 HTTP tests across nine files passed; the complete 47-test Playwright suite passed. After final photo controls/layout changes, all eight theme/gallery browser tests passed again, and all three responsive legal-page tests passed after the terms update. Production build and `git diff --check` passed. Existing full/mobile TikTok URLs, MP4/MP3, SEO and legal-page tests remain included in the regression runs.

The 27 final screenshots are in `docs/screenshots/command17/verified/`. Each prefix `390`, `768` and `1440` has: `first-visit-light`, `first`, `middle`, `last`, `preparing`, `completed`, `error`, `dark` and `gallery-full`. Viewports are 390×844, 768×1024 and 1440×1000; the extra full-gallery captures include the entire card. All were visually inspected, including source aspect ratio, visible controls, single-line position text, state panels and dark mode. Browser assertions check page overflow and absence of an internal vertical gallery scrollbar. Screenshots use clearly controlled local fixtures, not representations of the authorized live post.

## Authorized source check and production limitation

The first supplied source (`@kaimxth4/video/7632331094725070101`) analyzed as a video with two MP4 formats. The supplied photo source (`@aura4k77/photo/7509497470267772161`) normalized to 12 photos and zero video formats. Local production-service checks verified previews and individual image jobs for positions 1, 6 and 12: JPEG files of 125167, 338459 and 100306 bytes, respectively, with `.jpg` extensions. Temporary job files were removed after delivery.

These checks ran locally. Production access was not supplied, and no owner-authorized photo has been tested through production Nginx. Live production photo support is therefore **not verified**. Public-page availability and TikTok hydration compatibility can change; missing, restricted or unsupported metadata fails safely. Photo MP3, ZIP and slideshow video export remain unavailable. Existing Nginx/PM2 configuration and rate/concurrency limits were preserved. Nothing was committed or deployed.
