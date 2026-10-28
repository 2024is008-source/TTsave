# Final system audit — TikSaveMP4

Prepared October 28, 2026 (Asia/Colombo). This report records local implementation and verification, not deployment or a production certification.

## A. Executive summary

**Security decision: Pass after fixes for the reviewed local code; do not give production launch sign-off until the deployment gates below are verified. Risk: Medium because infrastructure, real video delivery and commercial provider settings remain unverified.** No critical vulnerability or confirmed secret exposure was found in the inspected snapshot. This is not a guarantee about uninspected Git history, the live VPS or future advertising creatives.

The Express/EJS/TypeScript TTsave repository remains at `D:/My Project/ttdownloder/ttsave/TTsave`. The browser preview the owner used on port 3000 is a separate Next.js checkout at `D:/My Project/Tiksave`. The reported photo and preview-Back defects were reproduced/traced in that preview and fixed there without replacing TTsave's architecture. Do not deploy either project using the other's runbook.

The supplied public post was tested through TTsave: all 10 images fully decoded, a ZIP containing positions 1, 6 and 10 was inspected in order, and no temporary files remained. After fixing the preview's alternate-representation lookup, its running HTTP API returned 200 with 10 photos, and its real first-photo download decoded as JPEG, 1080 × 1092, 81,308 bytes. The preview parser also rejects private/friends-only metadata and does not retry a representation after an explicit privacy rejection. Mobile preview Back, Close and Escape now preserve the same document, link and results in an intercepted-transport browser regression.

Advertising architecture is complete and default-off. No official Monetag code or origins were supplied; no real advertising was enabled or tested. Existing homepage markup, SEO, GA4 configuration and downloader controls are preserved. No Git push, commit, production access, DNS change, PM2/Nginx production restart or deployment occurred.

## B. Audit results

| Area           | Status                | Evidence / fixes                                                                                                                                          | Remaining                                                                     |
| -------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Downloader     | Local pass            | Live 10-image source, decoded individual images, selected ZIP, zero retained files; lifecycle/capability/timeout/cancellation tests; offline playable MP3 | Real MP4/MP3 from a supplied video through the VPS                            |
| Frontend       | Pass with fixes       | Preview history correction in the separate preview; complete browser coverage and six-width public-page overflow sweep                                    | Physical devices, Safari and manual assistive-technology checks               |
| SEO            | Local pass            | 11 canonical sitemap URLs, unique SSR titles/descriptions, canonical and noindex behavior, crawler assets, published article discovery                    | Deployed-domain recrawl and Search Console state                              |
| Blog           | Pass                  | Four approved articles preserved, images/internal links/schema and no-JavaScript accessibility tested                                                     | No new filler or fabricated dates added                                       |
| Admin          | Intentionally absent  | Previous owner instruction to remove admin remains authoritative; admin/auth URLs return 404 and do not load ads                                          | No dashboard/auth features are claimed                                        |
| GA4 / counters | Pass with fixes       | Consent, safe referrers, deduplicated events, delivered-vs-prepared distinction; consistent type filters/daily archives; restart expiry                   | Live property settings, collection and historical reporting access            |
| Monetag        | Implemented, disabled | Independent/global flags, reviewed private manifests, exact CSP, separate consent, duplicate prevention, excluded pages, no UI insertion                  | Official tags/origins, CMP adapter, real creative/mobile checks               |
| Security       | Local checks passed   | SSRF/DNS/redirect, process, path, capability, size/time/rate controls reviewed; zero known dependency findings; secret leads triaged                      | VPS egress, actual firewall/TLS/Cloudflare settings and restore test          |
| Performance    | Measured locally      | LCP/FCP/CLS, observed long-task blocking, bounded four-client liveness test, resource caps and streaming reviewed                                         | Field INP, Lighthouse TBT, real ad overhead and representative VPS media load |
| Localization   | English-only          | No language selector or localized indexable duplicate pages are advertised/introduced                                                                     | Additional locales/Arabic RTL are not implemented or claimed                  |
| Deployment     | Prepared, unexecuted  | Single PM2 fork, loopback bind, fixed canonical host, no private-route proxy cache, explicit country-header overwrite, updated runbook                    | Actual origin configuration and release verification                          |

### Confirmed findings and corrections

| Severity            | Finding and cause                                                                                                                                                            | Correction / evidence                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High                | Port-3000 preview failed the owner's photo link because it queried only `/photo/`, while that post's public hydration is available at the same ID's `/video/` representation | Bounded alternate lookup preserving the original canonical URL, ID checks, host validation and cancellation; mocked regression and real image decode passed |
| Medium              | Preview dialog had no browser-history entry, so Back could leave the result document                                                                                         | Temporary same-URL history entry plus popstate cleanup; Back/Close/Escape regression retains document marker, input and controls                            |
| Medium              | Local analytics type filter affected headline totals but not country/distribution/daily summaries; retained daily counts disappeared from charts                             | Apply consistent parameterized filters and include archived daily aggregates; three new counter regressions passed                                          |
| Medium              | Prepared counter records remained ready after process recovery even though media jobs are ephemeral                                                                          | Mark prepared records expired on real startup, preserving prepared counts and never inventing delivery; report-only readers do not recover active jobs      |
| Medium, conditional | A deployment enabling trusted country headers without overwriting inbound labels could accept visitor-supplied geography                                                     | Nginx template now overwrites X-TikSave-Country with XX; reviewed edge mapping is still required before opting in                                           |
| Low                 | Standalone photo/media verification and performance evidence depended on directories created by other commands                                                               | Create their private cache/evidence parents explicitly; live verification and standalone performance tests passed                                           |
| Low                 | Responsive artwork assertion confused the hero with another card reusing the same small asset; naturalWidth is density-corrected under width srcsets                         | Inspect the actual hero currentSrc and decode that resource's real dimensions; all four viewport/DPR cases passed without changing artwork or layout        |
| Low                 | Unbounded default test-worker allocation and five-second multi-page crawl ceilings produced cold-host timeouts                                                               | Two workers and a bounded 30-second test ceiling; every assertion remains, and the normal full check now passes                                             |

The security scan produced four leads: schema/environment identifier references and explicit negative-test strings. Reviewed leads were not exposed credentials. The actual dependency audit returned zero vulnerabilities, including development dependencies. Only `.env.example` and source/tests matched tracked environment-file names; no tracked PEM/key/database file was found in the reviewed index.

### Runtime and resource review

Input is Zod-validated, TikTok redirect hops and image hosts are restricted, Node image requests pin validated public DNS answers, and process execution uses shell:false with bounded arguments/environment/output. APIs do not use account cookies as download authorization; analyses/files/jobs use scoped expiring capabilities. Errors/logs avoid raw media links, token values, response bodies, command output and stack traces. Static serving is limited to assets. Public ad bootstrap routes return only configured code with no-store/noindex/same-origin restrictions; server code never evaluates publisher JavaScript.

Defaults remain two download/conversion jobs, four application operations, one photo archive, 100 MiB maximum configured download size, 64 MiB combined images and 12 MiB per image. Images are decoded under a pixel limit and archives are written incrementally. Free-disk guards, stream backpressure, abort propagation, isolated temporary paths and cleanup behavior are covered by the existing tests. These caps are starting limits, not proof of a particular number of concurrent visitors on the Contabo VPS. External tools still need the documented network-egress restrictions at deployment.

## C. Significant files modified

Paths below are relative to the TTsave checkout unless explicitly identified as the separate preview. Existing unrelated uncommitted image/migration changes were preserved; this list describes the advertising and final-audit work, not every earlier dirty file in the chat.

| File                                                            | Purpose                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `.env.example`                                                  | Default-off global/format/mobile flags and empty private-manifest settings                        |
| `.gitignore`                                                    | Ignore private publisher configuration and advertising screenshots                                |
| `README.md`                                                     | Link advertising setup                                                                            |
| `config/monetag/in-page-push.example.json`                      | Empty, unreviewed IPP placeholder; no invented ID/URL                                             |
| `config/monetag/vignette-banner.example.json`                   | Empty, unreviewed Vignette placeholder                                                            |
| `src/config/env.ts`                                             | Validated advertising configuration, safe blank optional paths                                    |
| `src/services/advertising.ts`                                   | Private-file validation, strict manifest/origin schema, exact tag delivery and deduplication      |
| `src/routes/public.ts`                                          | Eligible-page initializer/CSP and private bootstrap delivery; no public body redesign             |
| `src/app.ts`                                                    | Safe advertising-route log label                                                                  |
| `src/middleware/error-handler.ts`                               | Drop ad permissions on failed public renders                                                      |
| `public/assets/js/advertising.js`                               | Consent bridge, privacy signals, delayed head loading, once-only execution and interaction guards |
| `views/partials/head.ejs`                                       | Conditional deferred initializer only                                                             |
| `views/legal.ejs`                                               | Conditional advertising privacy disclosure                                                        |
| `src/services/operational-analytics.ts`                         | Filter/archive consistency and restart expiry                                                     |
| `deploy/nginx/ttsave.conf`                                      | Overwrite untrusted country labels                                                                |
| `scripts/verify-photos.ts`, `scripts/verify-media.ts`           | Standalone cache-directory setup                                                                  |
| `scripts/audit-local-load.ts`                                   | Bounded loopback liveness measurement                                                             |
| `tests/helpers/advertising.ts`                                  | Inert private local fixtures and guarded cleanup                                                  |
| `tests/advertising.test.ts`, `tests/advertising-loader.test.ts` | Configuration, consent/privacy, exclusion and duplication regressions                             |
| `tests/e2e/advertising.test.ts`                                 | Unchanged body/SEO/GA4, exact CSP, bootstrap and error isolation                                  |
| `tests/browser/advertising.spec.ts`                             | Browser consent/duplication/mobile/downloader checks                                              |
| `tests/operational-analytics.test.ts`                           | Filters, retained charts and restart regressions                                                  |
| `tests/browser/images.spec.ts`                                  | Correct actual-candidate pixel verification                                                       |
| `tests/browser/performance.spec.ts`                             | Standalone evidence directory, FCP and observed blocking metrics                                  |
| `tests/browser/responsive-audit.spec.ts`                        | All 11 public URLs at all six requested widths                                                    |
| `vitest.config.ts`                                              | Bounded worker and crawl-test resource budget                                                     |
| `docs/ADVERTISING.md`                                           | Full configuration/CMP/privacy/CSP/testing/rollback guide with official references                |
| `docs/DEPLOYMENT.md`, `docs/LAUNCH_CHECKLIST.md`                | Current gates and analytics/ad/Cloudflare backup guidance                                         |
| `docs/final-audit/*`, this report                               | Actual evidence and conclusions                                                                   |

Separate preview fixes at `D:/My Project/Tiksave`: `src/services/yt-dlp.service.ts` (same-ID public-photo fallback), `src/services/tiktok.service.ts` (reject restricted photo metadata), `public/saveframe.js` (dialog history), `scripts/check-tiktok.cjs` (fallback regression), `scripts/check-preview-back.cjs` (browser regression), and regenerated `src/ui/client-asset.json`/hashed public client bundle. No Express-to-Next migration was performed.

## D. Test results

| Command / evidence                                          | Actual result                                                                                                                                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                             | PASS: lint, strict types, 445 unit tests, 200 integration tests, production build and four published-blog validations; `final-audit/final-check.log`                                            |
| `npm run format:check`                                      | PASS; `final-audit/format.log`; generated audit JSON is formatted too                                                                                                                           |
| `npm run test:ui`                                           | Original complete run: 105 passed, one faulty shared-image assertion failed; all other browser cases completed, including ads, GA4, downloads, photos, audio, legal, blog and axe launch states |
| Corrected images/performance rerun                          | Six passed; `final-audit/browser-recheck-final.log`                                                                                                                                             |
| New six-width public-page sweep                             | Six passed, checking 11 URLs each at 320, 375, 390, 768, 1024 and 1440px; `final-audit/browser-recheck.log` preserves the initial standalone evidence-directory failures as well                |
| Browser coverage interpretation                             | 112 distinct cases covered across the complete run and subsequent rechecks; no claim of a single new 112-case run is made                                                                       |
| `npm audit --json`                                          | Zero known findings; `final-audit/dependencies.json`                                                                                                                                            |
| Security skill secret scanner                               | Four non-secret leads reviewed; `final-audit/secret-scan.log`                                                                                                                                   |
| `npm run tools:check`                                       | yt-dlp, FFmpeg, ffprobe, Chrome and MP3 capability available locally; `final-audit/tools.log`                                                                                                   |
| `npx tsx scripts/verify-photos.ts` with the supplied source | 10 full decoded images, selected ZIP positions 1/6/10, zero temporary files; `final-audit/photo-live.log`                                                                                       |
| `npx tsx scripts/verify-mp3.ts`                             | Playable 10,865-byte native MP3; full FFmpeg decode passed; offline synthetic source, `final-audit/mp3-smoke.log`                                                                               |
| `npx tsx scripts/audit-local-load.ts`                       | 40/40 loopback health requests, four concurrent clients, 332ms total, p95 124ms, about 4.8MB heap delta before GC; `final-audit/load.log`; not a media-capacity benchmark                       |
| Separate preview                                            | Typecheck/lint/TikTok/blog checks and the production build passed; new same-ID fallback regression passed; real first-image decode passed; Back/Close/Escape browser regression passed          |

Initial parallel crawler tests exceeded their five-second ceiling on this host. Those failures are retained in the early logs. Isolated/bounded reruns and the final normal check pass; no assertions or tests were removed. The original image test failure was a test-target defect, not evidence that downloaded TikTok photos were corrupt.

Latest unthrottled local performance observations with ads disabled: 390px LCP/FCP 328ms, CLS 0, observed long-task blocking 15ms; 1440px LCP/FCP 1,016ms, CLS 0, observed blocking 22ms. The earlier full-run sample was 416/508ms LCP, also CLS 0. These are variable local samples, not field Core Web Vitals, a Lighthouse score, official Lighthouse TBT or field INP. No live-ad overhead or VPS FFmpeg throughput is claimed.

## E. Monetag status

**Implemented, disabled, awaiting official tags and verified domains.** Global and both format switches remain false by default; mobile is a separate conservative opt-in. No popunder, OnClick, browser notification or MultiTag implementation is added. Official code must be supplied through reviewed private configuration. Only exact reviewed HTTPS origins can be added to CSP; no provider domains were guessed. A separate CMP callback is required before provider scripts load; GA consent cannot grant ad consent. Runtime code is never put inside download controls. Inert fixtures cannot establish real-creative behavior or vendor-specific privacy compliance. Read ADVERTISING.md before any activation.

## F. SEO status

The existing public set is 11 canonical pages, including the four approved published articles. All return indexable SSR HTML under the production domain in the local crawl. Query variants remain nonindexable, redirects use the fixed validated origin, unknown pages return 404, crawler assets remain accessible and APIs/private responses carry noindex. Article links, covers, related content, social previews and publication fields are preserved. Supported WebApplication/FAQPage/Blog/BlogPosting/BreadcrumbList data is factual and tested; FAQ markup is not presented as a promise of Google rich results. WebSite/Organization/WebPage graph expansion is an optional enhancement, not required for these pages to be indexable, and was not added as unrelated metadata churn. Sitemap lastmod is omitted rather than fabricated.

TTsave is English-only; additional languages, hreflang and Arabic RTL are not claimed. No untranslated locale duplicates were created. Production-domain retrieval through the research tool was unavailable, so local crawls do not certify today's deployed metadata, DNS, certificates or Search Console status.

## G. Deployment readiness

Ready for a controlled staging verification with ads disabled; **production deployment is not recommended until the remaining gates are closed**. Retain the existing single-fork PM2 design and documented concurrency caps for the 4-core/8GB VPS. Confirm actual executable paths, private temporary/data directories, source access, disk headroom, network egress, backups and graceful restart behavior on that machine.

Configure `NODE_ENV=production`, `HOST=127.0.0.1`, `PORT=3000`, `PUBLIC_BASE_URL=https://tiksavemp4.online`, reviewed proxy trust, tool paths and monitored contact information. Preserve the existing GA ID and consent settings. Keep advertising flags false. If counters are enabled, configure a private `OPERATIONS_DATA_DIR` and back up its key/database together. Never put credentials or official publisher code under public assets or Git.

These are future operator commands, not commands executed on the VPS by this audit:

```bash
cd /var/www/TTsave
node --version
npm ci
npm run check
npm run tools:check
sudo nginx -t
```

Only after an authorized release, drain/finish active transfers, take a consistent private-data backup, select the reviewed release and use the existing PM2 restart procedure. Check loopback /health and /ready, then HTTPS canonical redirects, a real source download, expiry/cancellation, logs, sitemap and private noindex/cache headers through Nginx/Cloudflare. Never expose the Node port directly. If Cloudflare is used, accept CF-Connecting-IP only from current verified trusted edge ranges; otherwise rate limits can group visitors by an edge address. Use Full (strict), a valid origin certificate and reviewed private-route cache bypasses. No settings/ranges were automatically installed.

Keep a known-good release and its matching environment. Back up SQLite consistently, not just its main file while uncheckpointed WAL data is active; preserve key/database/sidecars when using a quiesced filesystem copy and test restore in isolation. Jobs are ephemeral and must not be advertised as restart-resumable. Roll back the application artifact and matching configuration using the established PM2 procedure, revalidate health/readiness and keep ads globally disabled. No recursive production deletions or irreversible data migrations are required by these changes.

## H. Unresolved / unverified items

- **Production gate:** the VPS, Nginx syntax in its actual install, TLS renewal, Cloudflare trust/cache settings, egress firewall, log rotation, physical resource limits and backup restore were not accessed. The templates/runbook are not proof of applied configuration.
- **Live media gate:** a real video source's MP4/MP3 lifecycle through production is unverified. The owner's photo post and offline MP3 do not prove it. No restriction bypass, cookie login or private-content workaround was attempted.
- **Advertising activation gate:** official zones/origins, a real CMP integration, partner disclosures and actual creative interference/performance remain unverified. Keep real advertising disabled; this does not block ad-free staging.
- **Commercial policy gate:** current pages still identify operator/legal text as an operational draft. The owner must confirm identity, monitored channels, retention and provider arrangements; this report makes no legal compliance certification.
- **Coverage limits:** physical mobile Safari, screen readers/zoom beyond automated coverage, field INP, a Lighthouse score, third-party ad CPU cost and representative VPS media throughput were not measured. Do not infer them from local Chrome or liveness figures.
- **Repository distinction:** the reported visible-preview bugs were in the separate Next checkout and are fixed there. The TTsave photo flow already passed the supplied post. Deployment must choose the intended repository deliberately; neither was pushed or deployed.
