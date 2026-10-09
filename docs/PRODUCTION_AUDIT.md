# Production audit — October 9, 2026

## Findings before fixes

Inspected rules/design references (read during the preceding SEO task), package and lockfile, server startup/shutdown, environment, Express middleware, API/analyze/health/public routes, MP4/MP3 services, process limits, thumbnail SSRF protections, file cleanup, frontend contracts/controller, templates/styles/navigation, existing tests and deployment notes. No PM2 ecosystem or Nginx configuration exists in this checkout. No VPS SSH connection or owner-approved public test video has been supplied yet.

- `TRUST_PROXY=1`, required by the supplied deployment, is rejected because only true/false strings are accepted. When enabled, Express trusts every proxy rather than only the loopback Nginx peer.
- The documented `YT_DLP_PATH` name differs from the existing `YTDLP_PATH`; silently ignoring an explicitly configured tool path risks failed startup.
- Production HOST validation accepts a public bind address although this deployment requires 127.0.0.1.
- The global error handler logs raw Error/ZodError objects, potentially exposing submitted URL values, parser bodies, stacks or filesystem paths. Request logs retain arbitrary request paths; response logs can retain Location headers containing job identifiers. Normal tool logs already omit arguments/stdout/stderr.
- Frontend JSON parsing errors from an HTML proxy error response can display raw parser messages rather than an understandable service error.
- Global rate limiting exists, but there is no dedicated tighter limiter on expensive analysis and job creation. Cancellation, events and download delivery must remain available when a creation budget is exhausted.
- No production PM2/Nginx config verifies the single-process in-memory architecture, PM2 shutdown grace, nonbuffered SSE, noncached streaming files, fixed forwarded host/protocol and redacted access logs.
- Node thumbnail downloads pin validated public IPv4 DNS and revalidate each redirect. The external yt-dlp process resolves TikTok short-link/media redirects itself; Node cannot prove every child-process destination is public. An OS/network egress policy denying private/loopback/link-local destinations is required and remains a deployment gate. Do not claim full SSRF containment from syntax allowlists alone.
- Static/downloader/CSS sizes and offline response/resource behavior need current measurements. Existing synthetic MP3 verification does not establish live upstream availability.
- Existing captures lack 430px and a complete six-viewport, five-state matrix; touch targets/focus behavior need measured browser checks.
- Theme/menu buttons are 42px. Standalone header/footer navigation links and brand links also lack 44px minimum target dimensions; expand hit areas without changing the design direction.
- Real .env is ignored and only .env.example is tracked. No analytics/ad tracking is configured. Legal pages remain operational drafts and require a real monitored contact/operator review.

No live TikTok source, signed URL, cookie or secret was written into public evidence.

## Fixes and changed files

- `src/config/env.ts`, `.env.example`, `tests/env.test.ts`: support TRUST_PROXY=1/0, honor YT_DLP_PATH with conflict-checked legacy alias, reject non-loopback production binds. Public URL validation still permits only the canonical HTTPS origin.
- `src/app.ts`, `src/config/logger.ts`, `src/middleware/error-handler.ts`, `tests/e2e/security.test.ts`: trust only loopback proxy peers; sanitize error/request/response log fields; add a shared ten-POST-per-minute budget on analysis/job creation alongside the existing global limiter. Job cancellation/read/delivery do not consume that creation budget. Request bodies remain capped at 32 KiB. Limits are per process, hence one PM2 instance.
- `src/frontend/api-adapter.ts`, `tests/api-adapter.test.ts`, generated `public/assets/js/downloader.js`: HTML/non-JSON proxy failures now show a readable generic error instead of JSON parser text.
- `src/styles/_layout.scss`, `_tokens.scss`, `_sections.scss`: 44px theme/menu controls, brand and standalone header/footer navigation hit areas. Inline prose links retain normal text layout. No visual redesign or new downloader capability.
- `ecosystem.config.cjs`, `deploy/nginx/ttsave.conf`, `eslint.config.js`: deployment templates for one lowercase ttsave fork process, graceful termination, canonical redirects, restricted forwarded headers, text compression, privacy-conscious logs and nonbuffered/noncached SSE/media. Prepared only; Nginx syntax and TLS files have not been checked on Ubuntu.
- `package.json`, `package-lock.json`, `tests/browser/launch-audit.spec.ts`, `tests/browser/performance.spec.ts`: axe development dependency and reproducible browser/audit coverage. No new production dependency.
- `scripts/audit-performance.mjs`, `docs/PERFORMANCE_AUDIT.json`, `docs/screenshots/launch/`: measured synthetic resource evidence, 60 final captures, 12 accessibility reports, two browser performance reports and ten visual review contact sheets.
- `docs/DEPLOYMENT.md`, `docs/LAUNCH_CHECKLIST.md`, this report: production gates, ownership/privacy/egress prerequisites, deployment and rollback instructions. Existing earlier screenshot evidence was backed up before the suite and restored after it.

## Security and functional results

Unit/route tests cover HTTPS TikTok allowlists, invalid/unsupported inputs, deduplication/quality selection, restricted/deleted/unavailable extractor errors, type/format allowlists, filenames, MIME types, authentication/capabilities, delivery, expiration, cancellation/timeouts, unique temp roots, guarded cleanup and concurrency. Important media route tests mock child processes; they do not establish live TikTok availability. Owned synthetic MP4 passed the production ffprobe verifier and full FFmpeg decode. Owned synthetic audio passed production MP3 conversion/verification and full decode (10,865-byte two-second smoke output).

Child processes use spawn with shell:false, fixed arguments and bounded output/time. Client paths, filenames, raw selectors and extensions are rejected. Thumbnail SSRF tests cover public-address pinning, invalid/private addresses, DNS cancellation and redirect bounds. **Unresolved security gate:** external yt-dlp DNS/redirect destinations need tested OS/network egress containment. No bypass, cookie authentication or restriction workaround was added.

Tests confirm no raw submitted secrets/paths/stacks in error-handler log records; route logging redacts job IDs, queries and arbitrary paths. This is code/test evidence, not inspection of production logs. The Nginx access format omits URLs/headers; critical error logs still need restricted access and retention. No analytics/ad tracking exists. Dependency advisory check `npm audit --omit=dev --json` returned zero known vulnerabilities; it does not certify application security.

## Browser and accessibility evidence

All five requested states (idle, MP4 selected, MP3 selected, processing, error) were captured at 390×844, 430×932, 768×1024, 1024×900, 1440×1000 and 1920×1080 in BOTH themes: 60 full-page PNGs. Path pattern: `docs/screenshots/launch/{width}-{light|dark}-{idle|mp4|mp3|processing|error}.png`. Result metadata is explicitly synthetic fixture data, never fabricated real-download statistics.

Twelve final accessibility JSON reports show zero detectable WCAG 2 A/AA and 2.1 A/AA violations in all five states and zero undersized measured standalone controls. Checks also cover document/panel overflow, metadata focus, semantic radios, MP4 default, keyboard switching/quality restoration, indeterminate conversion progress and browser errors. Existing browser tests verify cancellation, actual fixture progress, browser file handoff, dark-theme persistence, menu Escape and disabled/unavailable states. Full-page contact sheets in `review/` were visually inspected for all 60 captures: no clipped/overlapping panels, misaligned phone or broken theme observed. Native full-size files remain available for close inspection.

Manual screen-reader, zoom, real touch device and broader browser checks remain open. Automated axe results do not prove complete accessibility; gradient text and dynamic announcements need human assessment. Existing live regions, labels, decorative alt handling, focus CSS and reduced-motion support were retained.

## Measured local performance

Windows / Node v24.18.0, local loopback, synthetic data; browser suite was running during collection. These are real measurements, not isolated capacity/production promises. Full raw values/method notes are in PERFORMANCE_AUDIT.json.

| Measurement                                                            | Observed                                                               |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 20 warm homepage HTTP/render/full-body samples                         | median 21.40 ms; p95 31.38 ms                                          |
| CSS                                                                    | 84,276 bytes; gzip estimate 15,980 bytes                               |
| Downloader JavaScript                                                  | 476,923 bytes; gzip estimate 100,564 bytes                             |
| All generated image files combined                                     | 1,143,100 bytes (not one page's transfer size)                         |
| 8 MiB HTTP streaming fixture                                           | 82.19 ms; sampled RSS delta 24,596,480 bytes                           |
| 64 MiB HTTP streaming fixture                                          | 415.67 ms; sampled RSS delta 15,634,432 bytes                          |
| Two simultaneous 60-second synthetic MP3 conversions plus verification | 456.17 ms; outputs 291,327 bytes each                                  |
| Separate FFmpeg MP3 null-output benchmark                              | user CPU 0.312 s; system CPU 0.016 s; wall 0.254 s; max RSS 22,216 KiB |
| Synthetic conversion fixture disk footprint at completion              | 1,140,489 bytes; all owned fixtures removed                            |
| Local Chrome 390px / 1440px                                            | LCP 284 / 380 ms; observed CLS 0 / 0                                   |

RSS includes the client fetch and server in the same process, sampled every 5 ms, with GC effects; it is not server-only memory or proof of a maximum. Disk figures describe the measured synthetic files, not an exact transient peak or large source worst case. Browser LCP/CLS are fresh-context, unthrottled lab observations with reduced motion, not field Core Web Vitals. Production capacity still needs representative VPS testing.

The download route uses a backpressured file stream/pipeline rather than reading the full video into a buffer. Job/application concurrency and disk/free-space/file-size limits exist. Production Nginx compression is prepared but not measured; direct local Express responses are uncompressed. The JS bundle remains relatively large because it includes shared validation; compression helps transfer but does not eliminate parse cost. System font stack avoids external font requests; eager/high-priority hero imagery has dimensions, below-fold images are lazy, and no unnecessary preloads were found. Generated downloads remain private/no-store; static validators and bounded cache lifetime remain intact.

## Final validation commands

| Command/check actually run                | Result                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `npm run lint`                            | pass                                                                           |
| `npm run typecheck`                       | pass                                                                           |
| `npm test -- --maxWorkers=1`              | 198 pass, 12 files                                                             |
| `npm run test:e2e -- --maxWorkers=1`      | 91 pass, 7 files                                                               |
| `npm run build`                           | pass: 28 image variants, local Sass, browser bundle, strict server compilation |
| `npx playwright test`                     | 39 pass, 4.2 minutes                                                           |
| `npm run tools:check`                     | local yt-dlp, FFmpeg, ffprobe, Chrome and MP3 encoder available                |
| `npx tsx scripts/verify-mp3.ts`           | full offline MP3 decode passed                                                 |
| `node scripts/audit-performance.mjs`      | synthetic streams/conversion/MP4 verification/cleanup passed                   |
| `npm audit --omit=dev --json`             | zero known vulnerabilities                                                     |
| compiled local server `/health`, `/ready` | HTTP 200: ok / ready                                                           |
| `git diff --check`                        | pass                                                                           |

Windows tests ran with TEMP/TMP in an owned D: cache directory and one Vitest worker. An earlier default-worker run timed out while dependency installation overlapped; the final clean sequential validation passed. Browser fixture automation initially targeted a hidden radio directly; corrected to visible label/keyboard interaction before the final successful run. No ignored real .env was exposed, no Docker files created, no commits made, no VPS restart/reload executed.

## Production verification — launch blocked

Public DNS/curl checks at approximately 10:09 UTC October 9, 2026:

| Check                                                  | Actual result                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Apex DNS A                                             | 162.255.119.186                                                                            |
| www DNS                                                | CNAME parkingpage.namecheap.com → parking.d.parity.domains; A 2.59.170.19 / 104.219.250.36 |
| HTTP apex                                              | 302, Location http://www.tiksavemp4.online/, X-Served-By Namecheap URL Forward             |
| HTTPS apex                                             | curl timeout after 8 seconds                                                               |
| HTTPS www                                              | curl Schannel TLS handshake failure                                                        |
| Public health, robots, sitemap and live downloads      | cannot verify through unavailable HTTPS deployment                                         |
| VPS npm ci/build, PM2, nginx -t, firewall, TLS renewal | NOT RUN: no SSH access/alias supplied                                                      |
| Live permitted MP4/MP3                                 | NOT RUN: no owner-authorized source supplied                                               |

Remove registrar forwarding/parking, point both names to the correct VPS, configure a trusted certificate for both names, test child-process egress policy, then validate Nginx/PM2 and actual permitted MP4/MP3 downloads. DNS/HTTPS observations are from this client's network and may change; recheck after corrections. Do not weaken validation or bypass restrictions to obtain a passing download.

Operator actions also include monitored support/legal inbox and legal approval, Search Console/Bing ownership/sitemaps, log rotation/retention, backups/restore/rollback test and real-device accessibility checks. See the separate automated/manual launch checklist.

**Recommendation: HOLD LAUNCH.** Local code validation passes, but production acceptance criteria are not met. Nginx syntax, PM2 health, canonical redirects, trusted HTTPS, production health and live MP4/MP3 are unverified or failing.
