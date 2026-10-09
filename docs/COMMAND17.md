# Photo downloads and final local verification

Updated for Command 15 on 2026-10-09. This report supersedes the earlier individual-photo-only summary. No commit, push or deployment was performed.

## Initial architecture findings

The existing analyzer normalizes verified public video metadata and deduplicated source MP4 formats; usable source audio plus checked FFmpeg capability enables MP3. Download jobs choose server-owned selectors from an unexpired analysis. Separate random capabilities authorize analysis previews, job status/events/cancellation and one-use prepared-file delivery.

The existing photo path already distinguished `postType: "photo"` from `"video"`. It parses matching public SIGI_STATE or universal hydration metadata, requires supported image metadata and rejects private/friends-only or nonzero source status. A thumbnail alone never becomes a gallery. `/photo/` may use the public `/video/` representation of the same ID within the existing budget; restricted extractor failures never use a bypass. Before implementation, the missing feature was multi-selection/ZIP; individual photo fetching, network protection, MIME verification and guarded cleanup were already available.

Implementation extends those contracts, routes, jobs and frontend state instead of creating a separate downloader. It preserves the approved homepage, shared tokens, outer result workspace and MP4/MP3 controls. Only the photo result receives new selection controls. CSS changes are confined to `_photos.scss`; cache versions change consistently across the entrypoint and test imports.

## Model, API and authorization

The existing `postType` discriminator and `capabilities.images` remain authoritative. Photo-only analysis has no video formats and no MP4/MP3 capability. Images expose UUID IDs, original one-based positions and local authorized preview paths. Upstream image addresses, signatures, cookies, headers, selectors, raw metadata and filesystem paths remain server-side.

Individual requests use `photoId`; selected requests use `photoIds`. Exactly one is allowed in a strict Zod image intent with analysis ID, capability and `downloadType: "image"`. Arrays require 1–35 distinct UUIDs. The service validates every ID against the same authorized, unexpired post, rejects cross-post/unknown selections, then restores original order. Empty, duplicate, excessive, mixed, URL-bearing and extra-field requests fail. Existing MP4 and MP3 request contracts and rate limits remain unchanged. See API.md for examples.

## Download and preview workflows

An individual selection fetches the server-owned source through `publicFetch`, verifies JPEG/PNG/WebP MIME, signature, decoder type, dimensions and complete decoding, writes fixed `image.bin` inside a unique guarded `job-*` directory, and offers a safe numbered attachment with the actual verified extension. One ID submitted as a selection array still returns the image directly.

Two or more selected IDs produce one `application/zip` attachment. The ZIP STORE writer fetches sequentially, writes verified original image bytes with UTF-8 safe numbered names, CRC32 and an ordered central directory. Images are already compressed; no shell/archive program or new dependency is used. CRC work yields every 64 KiB, writes handle partial output, and both check cancellation. One bounded source image is buffered at a time. Entry paths contain no separators or directories. Complete ZIP size includes headers and is bounded by DOWNLOAD_MAX_BYTES.

Previews are contained WebP images at most 480 × 480, never upscaled, cached only after authorization, with at most 32 entries of at most 1 MiB each. Cache expires with analysis authorization and clears on shutdown; expired entries are pruned on preview requests and the periodic sweep. Originals retain their bytes. The existing main/thumbnail window and collapsed lazy selection grid avoid loading every full-resolution photo to render mobile controls. There is no external hotlinking or CSP expansion.

## Security and resource bounds

Only HTTPS public TikTok input on the five exact permitted hosts (tiktok.com, www.tiktok.com, m.tiktok.com, vm.tiktok.com and vt.tiktok.com) is accepted. Credentials, usernames in URL authority, ports, malformed/encoded/deceptive hosts and suffix attacks remain rejected. Mobile links retain the three-hop validated/pinned resolver.

Photo metadata and image retrieval reuse HTTPS validation on every redirect, explicit CDN hostname policy, all-answer DNS checks, rejection of loopback/private/link-local/multicast/reserved/metadata IPv4 and IPv6, and fresh sockets pinned to verified public IPs with TLS hostname/certificate validation. Mixed DNS answers are rejected. DNS lookup results cannot redirect a connection to another address. Only fixed server headers are sent; browser cookies, Authorization and user headers are not forwarded. Image redirects are capped at two, connection/header deadlines at two seconds, total remote budget at eight seconds. Routes return safe errors and private/no-store/nosniff responses without raw upstream information.

Maximum photos: 35, including raw metadata validation before normalization. Maximum metadata: 2 MiB. Maximum image: 12 MiB and 40 million decoded pixels, one supported static image. Maximum combined originals: 64 MiB. Complete output is additionally bounded by configured DOWNLOAD_MAX_BYTES. Photo processing: at most 60 seconds or configured DOWNLOAD_TIMEOUT_MS if lower. ZIP concurrency: one. Each archive retrieves one image at a time and occupies the existing application/download capacity. Existing configured video/audio limits remain unchanged (default application four, downloads two). Disk free space is checked before writing. Busy, timeout and size failures are safe and retryable where appropriate.

Temporary job cleanup follows existing guarded realpath containment. Success/disconnect delivery consumes its one-use token and cleans after the stream closes. Failure, abort, timeout, cancellation, expiry and shutdown close work and remove only the unique job directory. Existing orphan sweep and retention defaults remain: ten-minute analysis/job, sixty-second ready-file access, thirty-second sweep. Cleanup failures are logged with safe categories for retry. Active streams are preserved until their release completes.

The Node network layer protects photo fetches. yt-dlp uses its own networking; the existing requirement to enforce and test OS/process-tree egress restrictions remains a public-launch blocker. This task did not install a VPS firewall.

## Gallery and UI preservation

The current compact individual gallery remains. Its photo-only disclosure is headed “Choose images” and includes the requested supporting text, semantic checkboxes, original positions, Select all, Clear selection, a live selected count and Download selected. Multi-selection starts empty, invalid selections are ignored, changes use existing announcements, and a new URL removes previous previews/selection/capabilities. Selecting a photo remains separate from checking photos to save. Prepared individual or archive delivery permits further selection without reanalysis; preparing/completed/error states use the existing components and honest indeterminate progress.

Grid previews preserve aspect ratio, reserve stable dimensions, lazy-load and use concise alt text. Controls retain existing gradient/glass/focus styling with at least 44px target rows. Layout expands naturally with no internal result scrollbar or horizontal overflow. Photo MP3 and slideshow video export are unavailable.

Git HEAD was reconstructed in ignored local cache for before/after screenshots at 390 × 844 and 1440 × 1000. Paths: `screenshots/command15/before/{390,1440}-{idle,mp4,mp3}.png` and corresponding `after/` files. Isolated `{width}-{mp4,mp3}-panel.png` captures are pixel-identical for all four comparisons; idle full pages are also pixel-identical. Full-page result captures have browser raster/scroll differences outside the panel and are not claimed pixel-identical. Comparison evidence: `screenshots/command15/ui-comparison.json`.

New photo captures at 390 × 844, 768 × 1024 and 1440 × 1000: `screenshots/command15/{width}-{photo-ready,multiple-selected,preparing,completed,error,unsupported}.png`. Existing responsive/theme regressions write to `screenshots/command15/regression-final/`. Screenshots use controlled fixtures; live authorized media is not retained as evidence. Visual review checks the panel, contained previews, selection/focus, status copy and natural expansion, in addition to browser accessibility/overflow assertions.

## SEO and legal changes

Only homepage metadata changes: “TikTok Downloader – Download MP4, MP3 & Photos | TikSaveMP4”; description says supported public videos, available audio and supported photo posts with source-dependent options. Open Graph/Twitter reuse that title/description; WebApplication describes individual photos/selected ZIP without fake ratings, counts or performance claims. Canonical remains validated https://tiksavemp4.online. Visible hero, H1, sections, FAQ and navigation remain unchanged; sitemap and robots restrictions are preserved. Legal text makes one necessary correction: selected images can form a ZIP, while slideshow export remains unavailable. Permission, ownership/reuse restrictions, public-only scope and nonaffiliation remain.

## Manual local verification

Authorized photo source normalized to 12 photos. All 12 individual images fully decoded. Selected ZIP contained only positions 1, 7 and 12 in original order, with real JPEG members; archive MIME application/zip, output 321825 bytes. No temporary job files remained. Tests also verify cancellation, failure/timeout cleanup, unauthorized and unavailable fixture behavior. `scripts/verify-photos.ts` reproduces this manual check without retaining media or capabilities.

Authorized video source normalized to video with two formats and usable audio. Both live MP4 and independent MP3 preparation reached the unchanged DOWNLOAD_TIMEOUT; live playback/delivery therefore did not pass this session. The existing video pipeline was preserved and its deterministic regression tests remain mandatory. Do not interpret successful analysis or synthetic tests as proof of current upstream availability. `scripts/verify-media.ts` records only safe result categories and removes temporary files.

Local production route checks returned 200 with correct content types for /, /health, /ready, /robots.txt, /sitemap.xml, /privacy, /terms and /responsible-use. Health/readiness are noindex. A deceptive hostname returned a safe 400. Evidence: `screenshots/command15/local-routes.json`. Tool diagnostics confirmed yt-dlp, FFmpeg/FFprobe, Chrome and MP3 encoder availability.

## Final automated verification

Node.js 24.18.0: lint, strict typecheck and production build passed; all 332 unit tests across 19 files and 103 HTTP tests across nine files passed. The complete final Playwright suite passed all 54 tests. Earlier attempts encountered Windows mapped-file screenshot locks; unique per-run evidence paths resolved those infrastructure failures. Production dependency audit: zero vulnerabilities. Existing offline diagnostics verified full MP4 decoding, real MP3 conversion and temporary-fixture cleanup; evidence is screenshots/command15/performance-audit.json. Automated tests are deterministic and never depend on TikTok availability. Unit suites cover URL/SSRF validation, content/signature/pixel/size checks, filenames, metadata discrimination and ordering, CRC/ZIP generation, cancellation and frontend selection. HTTP tests additionally cover strict image intents, capability expiry/membership, single/ZIP delivery, ordered members, aggregate output limits, archive concurrency, timeout abort and cleanup. Browser tests cover existing video/audio/theme/SEO/legal/responsive behavior and new selection/error/unsupported photo states with keyboard and axe checks.

## Exact implementation files

- API/server: src/api/contracts.ts, src/routes/api.ts, src/services/memory-store.ts, src/services/downloader.ts, src/services/filename.ts, src/services/photo-metadata.ts; new src/services/photo-archive.ts.
- Frontend: src/frontend/contracts.ts, src/frontend/api-adapter.ts, src/frontend/state-machine.ts, src/frontend/downloader.ts, src/frontend/photo-gallery.ts, views/partials/photo-gallery.ejs, src/styles/_photos.scss; rebuilt public/assets/js/downloader.js; cache versions in public/assets/js/app.js and views/partials/head.ejs.
- Metadata/legal: src/routes/public.ts, src/services/seo.ts, src/data/legal-pages.ts.
- Tests: playwright.config.ts, tests/browser/evidence.ts, tests/api-adapter.test.ts, tests/photo-state.test.ts, tests/photo-metadata.test.ts, tests/e2e/photos.test.ts, tests/e2e/seo.test.ts; new tests/photo-archive.test.ts and tests/browser/photo-selection.spec.ts. Existing browser specs changed only for module cache versions and evidence paths: tests/browser/downloader.spec.ts, tests/browser/fetch-panel.spec.ts, tests/browser/hero-states.spec.ts, tests/browser/launch-audit.spec.ts, tests/browser/legal.spec.ts, tests/browser/mp3.spec.ts, tests/browser/performance.spec.ts, tests/browser/photos.spec.ts, tests/browser/result-workspace.spec.ts and tests/browser/ui.spec.ts; new tests/browser/evidence.ts and playwright.config.ts select a fresh evidence directory per run to avoid Windows preview file locks; fetch-panel.spec.ts replaces the previously removed visual checkmark assertion with the existing native checked-state assertion.
- Manual tools: new scripts/verify-photos.ts, scripts/verify-media.ts, scripts/verify-ui-preservation.ts.
- Documentation/evidence: README.md, docs/API.md, docs/DEPLOYMENT.md, this report and screenshots/command15/.

## Production actions and limitations

No production access was supplied. No real Nginx/PM2 launch, production TLS/domain/configuration check or production photo download has been verified. Follow DEPLOYMENT.md's existing install, readiness, TLS, single-process PM2 and rollback commands; verify egress policy, owner-authorized MP4/MP3 playback, individual images/selected ZIP, cancellation, cleanup, expiry and limits on the actual VPS. Public TikTok metadata/source availability can change and unsupported/restricted posts fail safely.

No .env, cookie file, signed URL or credentials were added. No downloaded live content or ZIP was added by this task. Two historical tracked verification MP4s already exist in the repository (`docs/live-verification.mp4`, `docs/live-browser-verification.mp4`); they were not introduced or modified here. They should be excluded from deployment and future public evidence; their presence means a blanket claim of no tracked media would be inaccurate. Existing historical screenshots/reports overwritten by tests are restored from the pre-task copy.

Recommended commit (left to the user): `feat: add secure TikTok photo downloads and finalize project`.
