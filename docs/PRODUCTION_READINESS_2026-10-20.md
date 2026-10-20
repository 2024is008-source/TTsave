# Final production-readiness audit — October 20, 2026

## 1. Executive summary

The current checkout builds and passes local service, route and controlled media checks. Two reproducible application defects were fixed: in-flight analyses were not cancelled/drained during service shutdown, and the existing publisher declaration was inaccessible at `/ads.txt`. Environment-file exclusions and five existing formatting failures were corrected. Published articles, homepage metadata/keyword targeting, headings, visual behavior, downloader contracts/format selection, GA4 IDs and publisher configuration were preserved.

This is a repository and local Windows audit, not a deployment certification. The previous same-day public HTTP evidence showed a different live application/configuration: blog URLs returned 404, the sitemap omitted them and live robots blocked versioned resources. No VPS, PM2, Nginx, firewall, Search Console or real Google property was accessed or changed.

## 2. Readiness decision

**NOT READY FOR PRODUCTION until the deployment/security gates in sections 3 and 16 have evidence.** There are no known remaining failed essential local checks in the final result, but child-process network containment remains unverified and the public server has not been shown to run this reviewed release. A successful local build does not satisfy those gates.

## 3. Findings and severity

| Severity                        | Finding                                                                                                                                                                                                                 | Evidence / disposition                                                                                                                                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High                            | yt-dlp's own DNS/media redirects are outside Node's pinned network layer. No tested VPS egress policy was supplied.                                                                                                     | Existing, unresolved launch gate in DEPLOYMENT.md. Do not assert arbitrary internal destinations are unreachable without OS/process-tree enforcement and controlled verification. Manual remediation in section 16.                                                             |
| High                            | Live release/configuration drift: blog plus four published URLs were 404; live sitemap had 6 rather than local 11 URLs; live robots included `Disallow: /*?*`.                                                          | Prior same-day read-only snapshot in SEO_LIVE_EVIDENCE_2026-10-20.json and TECHNICAL_SEO_AUDIT_2026-10-20.md. Repository crawler routes are already correct. Resolve intended release/upstream manually, then verify publicly. No deployment performed.                         |
| High, fixed                     | `dispose()` did not abort or await active metadata analyses. Pending HTTP/photo analysis could continue and return after the service's stores had been cleared.                                                         | `src/services/downloader.ts`: per-analysis service-owned AbortController, combined caller signal, completion tracking, abort/drain before clearing stores. Regression exercises an analyzer that returns metadata after cancellation; late data is rejected and shutdown waits. |
| Medium, fixed                   | `public/ads.txt` existed but only `/assets` was mounted; `/ads.txt` fell through to 404.                                                                                                                                | `src/app.ts` now serves exactly the existing fixed file. Integration test checks GET/HEAD, content, MIME, nosniff and continued denial of `.env`/package.json. No ID/content change and no ad script added.                                                                     |
| Medium, fixed                   | `*.env` did not protect common `.env.local` / `.env.production` files.                                                                                                                                                  | `.gitignore` now also excludes `.env.*`, with explicit `.env.example` exception. `git check-ignore --no-index -v` confirms these cases. Real secrets were not read or edited.                                                                                                   |
| Medium, open operational review | Analytics has no consent banner; `.env.example` contains the existing optional measurement ID. Actual stream Enhanced Measurement, consent requirements, retention and operator disclosures cannot be verified locally. | Existing privacy text and ANALYTICS.md disclose the limitation. Owner must verify activation arrangements before commercial operation; IDs/configuration unchanged.                                                                                                             |
| Medium, retained owner copy     | Homepage description makes an unconditional “without watermark” claim although format preference is not watermark-absence verification.                                                                                 | Existing approved metadata retained as explicitly required. Verify the claim operationally or obtain approval for revised copy; no SEO substitution was made.                                                                                                                   |
| Low, fixed                      | Prettier failed on five existing files.                                                                                                                                                                                 | Formatting-only changes in the scripts, TikTok resolver, result SCSS and phone partial listed in section 8.                                                                                                                                                                     |
| Low, open maintenance           | The installed ESLint package's lockfile metadata marks that version unsupported.                                                                                                                                        | No current npm security advisory. Plan a separately reviewed compatible tooling migration; no blind force fix or major upgrade performed.                                                                                                                                       |
| Low, open performance           | Downloader bundle remains about 474 KiB before compression.                                                                                                                                                             | Existing Zod-backed browser validation is retained; conditional loading avoids this cost on legal/blog pages. No cosmetic rewrite or speculative dependency removal.                                                                                                            |

No new reproducible critical code defect was identified within this audit. This statement does not replace the unresolved high-severity deployment gates or establish a security guarantee.

## 4. Exact implementation changes

`ProductionDownloaderService.analyze()` now registers a service-owned cancellation controller and completion promise after acquiring capacity, combines its signal with the caller's signal, and releases tracking in `finally`. `dispose()` stops admission, aborts those controllers and waits for completion before clearing analysis/job/preview stores. Existing request cancellation, capacity limits, metadata normalization and download contracts are unchanged. The caller's controller is never mutated.

The new `/ads.txt` handler uses a server-controlled absolute file path and Express file delivery. It does not mount the entire public directory or accept client paths. The checked-in publisher declaration is returned unchanged as text/plain with existing Helmet headers. GA4 is not loaded by this text response.

Environment exclusion rules now cover common variant files. No production environment values, analytics IDs, publisher IDs, packages or lockfile versions changed.

## 5. Security review and residual risk

Reviewed URL schemas, short-link resolution, public-address rules, publicFetch, thumbnail/image handling, extractor options/process runner, metadata normalization, job authorization, API request/response schemas, file claims, cleanup, filename generation, error handlers, request logging, templates/JSON-LD and proxy settings.

- Submitted sources use exact approved TikTok hosts, HTTPS, narrow video/photo/short-code paths, bounded lengths and literal-authority checks. Credentials, encoded/lookalike hosts, IP literals, localhost and unsafe schemes fail. Short-link hops are revalidated with public DNS checks and pinned TLS connections; paths/queries cannot become arbitrary proxy targets.
- Photo/media preview fetches have host policies, per-hop checks, public address pinning, time/byte budgets and verified image MIME/signatures. Photo decode limits and archive limits bound work. Host allowlists and Node pinning do **not** contain yt-dlp's separate network stack: the high-severity OS egress gate remains.
- All external programs use the central `spawn` runner with `shell:false`, fixed argument arrays, a restricted tool environment, validated executable configuration, output caps, timeout and cancellation. No submitted text becomes a shell command. yt-dlp ignores config/plugins/cookies and does not bypass private/login/region restrictions. Only analyzed deliverable single-file MP4 selectors enter jobs; MP3 conversion uses local server-created paths. No new format capability was added.
- Jobs use random identifiers/capabilities, constant-time token comparison, short-lived single-use file access and server-owned temporary directories. API/file routes are no-store/noindex. Client-selected paths/names are rejected; attachment names are normalized and bounded. File responses stream with backpressure rather than reading videos into memory. HEAD/range restrictions protect single-use delivery.
- TTL sweeps, interrupted-delivery cleanup, cancellation, timeout and disposal are covered by controlled tests. Cleanup is best-effort with retries/logging; abrupt host termination and actual Linux filesystem/ownership behavior require VPS testing.
- Expensive POST creation has a shared 10/minute/IP budget, with an additional 100/minute route limiter. Body parsers cap 32 KiB. Application/download/analysis/archive capacity limits are retained. Budgets and job state are process-local; do not run multiple instances.
- EJS dynamic text uses escaping; raw includes are server-controlled templates and serialized JSON-LD escapes HTML-sensitive characters. Frontend metadata uses textContent/DOM nodes. No inline application script, eval or shell interpolation was introduced.
- No session-authenticated account/cookie action or permissive CORS policy was identified. Job mutation uses bearer capabilities and JSON-validated requests; do not treat this as blanket protection if authenticated accounts are added later.
- Helmet/CSP, no-referrer response policy, fixed public URL generation and loopback-only proxy trust were preserved. Nginx overwrites forwarding headers in the supplied template; actual installed configuration is unverified.
- Only `.env.example` is tracked among environment files; no tracked PEM/key/PFX files were listed. This targeted inspection is not a forensic secrets scan of all Git history. Logger/request serializers omit entered URLs, query tokens, raw error details and response capability headers. Provider/error logs and retention still require owner review.

No destructive security probes or production load tests were performed. No security header was weakened.

## 6. Performance and resource management

Retained bounded jobs/maps, 250 ms file-size monitoring for media, process deadlines, bounded preview caching, sequential ZIP image retrieval, archive byte accounting, streamed delivery and static cache validators. Static assets bypass application request budgets. Nginx compression and unbuffered/no-cache SSE/media are prepared in the existing template, not verified on Linux.

Current controlled measurements are in READINESS_PERFORMANCE_2026-10-20.json. These are local Windows observations, partly concurrent with browser checks, not isolated capacity measurements or production promises:

| Measurement                                      | Result                                                       |
| ------------------------------------------------ | ------------------------------------------------------------ |
| Warm homepage HTTP/full-body samples             | 20; median 19.05 ms, p95 29.05 ms                            |
| CSS                                              | 97,302 bytes; gzip estimate 17,770 bytes                     |
| Downloader JS                                    | 485,505 bytes; gzip estimate 102,624 bytes                   |
| 8 MiB / 64 MiB streamed fixture                  | Exact byte counts delivered; release callback reached        |
| Owned 60-second synthetic MP4                    | Production probe and full FFmpeg decode passed               |
| Two concurrent MP3 conversions from that fixture | Both production probes passed; about 295 ms combined elapsed |
| Temporary measurement root                       | Removed successfully                                         |

The streaming benchmark's client and server share one process, so RSS includes both fetch buffers and GC; it cannot establish server-only peak memory. MP3 checks here verify conversion/probing, not a fresh full MP3 decode. Actual source downloads and VPS capacity remain unverified. No unsupported speed/quality/statistics were added to the UI.

## 7. Code cleanup

Fixed only reported formatting, inaccurate README asset/reference descriptions and stale launch-checklist claims. Kept old dated audit documents as historical evidence. No uncertain file, dynamically referenced asset, useful test or published prose was deleted. No new dependency or infrastructure was introduced. The legacy `/analyze` endpoint and test mock store remain intentionally present for compatibility/tests; deleting them would not be safe cosmetic cleanup.

## 8. Files modified or created

Application/security/tests:

- `.gitignore`: environment variants.
- `src/app.ts`: fixed-path ads.txt delivery.
- `src/services/downloader.ts`: cancel/drain active analyses during shutdown.
- `tests/download-jobs.test.ts`: shutdown regression.
- `tests/e2e/app.test.ts`: publisher-file route regression.

Formatting only:

- `scripts/capture-live.ts`
- `scripts/verify-ui-preservation.ts`
- `src/services/tiktok-link.ts`
- `src/styles/_result.scss`
- `views/partials/phone-preview.ejs`

Documentation/evidence:

- `README.md`: current 18-source artwork pipeline and owner-removed reference HTML.
- `docs/LAUNCH_CHECKLIST.md`: current evidence and unresolved launch gates.
- `docs/PRODUCTION_READINESS_2026-10-20.md`: this report.
- `docs/PRODUCTION_SMOKE_2026-10-20.json`: 23 built-server checks.
- `docs/READINESS_PERFORMANCE_2026-10-20.json`: owned offline fixture measurements.
- `docs/DEPENDENCY_AUDIT_2026-10-20.json`: npm advisory response.
- `docs/screenshots/browser-1792516067041/`: fresh browser-generated evidence; older evidence preserved. Additional blog layout attachments remain in ignored Playwright output.

No existing repository file was removed. Temporary audit runner files and owned measurement fixtures were removed after use. Git status was clean at the start of this turn; the previous audit's changes had already become the baseline. No commit, push, deployment or production service restart was performed.

## 9. SEO/sitemap verification

Public routes derive fixed URLs from validated PUBLIC_BASE_URL. Current sitemap contains exactly 11 unique clean canonical URLs: home, five legal/contact pages, blog listing and four published articles. Registry-derived tests follow every entry and check HTTP 200 SSR HTML, one canonical/H1/meta description, index,follow, unique metadata and no conflicting noindex header. Drafts, query variants, APIs, health, events, previews and download files stay excluded. No artificial lastmod/priority/changefreq is emitted. Query HTML remains clean-canonical/noindex,follow while assets with version queries remain crawlable. JSON-LD remains inert, escaped, consistent with visible content and does not invent authors or modification dates.

The homepage title and description were not changed. Open Graph/Twitter metadata still use the page's existing shared metadata. Local templates retain all headings and the primary TikTok-to-MP4 targeting.

The prior same-day public audit measured one-hop permanent redirects from HTTP apex, HTTP www and HTTPS www to HTTPS apex (also tested on `/privacy`). Those correct redirects must not be removed because Search Console labels them redirect pages. Five live legal/contact URLs were indexable 200 responses with self-canonicals, so their reported indexing status did not establish a code defect. Live blog/robots/sitemap drift remains a release/hosting investigation, not a reason to rewrite the correct repository generator. No new live SEO mutation or Search Console submission occurred here. Indexing cannot be guaranteed.

## 10. Blog verification

All four expected modules remain published and build-validated, with distinct slugs/metadata and four local cover images:

1. `/blog/how-to-convert-tiktok-to-mp4`
2. `/blog/how-to-convert-tiktok-to-mp3`
3. `/blog/how-to-download-tiktok-images`
4. `/blog/how-to-download-tiktok-videos-on-pc`

Listing, related/contextual links, all sitemap entries, SSR with JavaScript disabled, responsive images, both themes and card/article layout are covered. The homepage preserves the owner's three-card MP4 → MP3 → Images order; PC remains accessible in the complete listing. No content, date, heading, draft status or publication record was rewritten. Confirm approved timestamps against actual first public availability when resolving deployment drift.

## 11. Dependency audit

Runtime: Express, EJS, express-rate-limit, Helmet, Pino/pino-http, Sharp and Zod. Build/test tooling is declared as development dependencies; external yt-dlp, FFmpeg/FFprobe and curl_cffi's Chrome impersonation support are separate system requirements.

Node 24.18.0 and npm 11.16.0 satisfy engines. Lockfile v3 root name/dependency/devDependency entries match package.json; all resolved package records have integrity entries; npm ls reports no dependency problems. Current npm audit across production and development dependencies reports **0 vulnerabilities** (including critical/high/moderate/low). The service counted 412 dependency entries; lockfile contains 413 records including its root. ESLint's existing unsupported-version notice remains a maintenance warning. No dependency update was necessary or applied. Linux-native Sharp installation and tool packages must still be verified with npm ci/tools:check on the VPS.

## 12. Automated validation

Final results below were recorded after completion. No test was removed, skipped or weakened.

- `npm run check`: PASS — ESLint; strict typecheck; **404 unit tests / 21 files**; **172 integration tests / 17 files**; production build.
- `npm run format:check`: PASS after the initial five formatting failures were corrected.
- `npm run test:ui -- --timeout=60000`: PASS — **96 tests / 21 files**, 4.1 minutes; Chrome, both themes, mobile/desktop, download and photo/ZIP states, article layouts, SEO and Analytics privacy.
- `npm run tools:check`: PASS; yt-dlp, FFmpeg, FFprobe, Chrome impersonation and MP3 encoder available locally.
- `npm audit --json`: PASS, zero known vulnerabilities; evidence saved.
- `npm ls --all --omit=optional --json`: no dependency problems.
- `git diff --check`: PASS.

Initial failures were investigated rather than suppressed: five Prettier failures were corrected; the new test initially used an ES2024 Promise helper outside this project's ES2023 lib and was rewritten using a normal typed Promise. An overlapping/sandboxed Vitest run failed on missing temporary transform files; the subsequent sequential full check passed all suites. Sandboxed loopback smoke/performance access failed with EACCES/startup failure and the first browser runner was stopped before tests; these checks were rerun with local process/network access outside that sandbox. No application or security settings were weakened to make them pass.

Browser analytics uses a stubbed tag/collection transport, so those assertions verify this application's parameters and initialization, not live Google SDK transport or traffic classification. Browser downloader/media APIs use controlled fixtures; no artificial Google Organic traffic or real GA4 hits were generated.

The six-width light/dark launch matrix generated 60 state screenshots and 12 accessibility reports: zero reported axe violations and zero undersized measured standalone controls. Two representative full-page captures were visually inspected (1440px light idle and 390px dark processing); this is not a claim that all screenshots or actual devices received human review. Blog layout tests separately bring lazy-loaded covers into view and assert decoded image width; full-page snapshots can show unvisited lazy images as blank. Manual screen-reader and real-device checks remain open.

## 13. Production build

PASS: 36 responsive WebP variants from 18 sources, raster social image/favicon, local Sass, minified ES-module frontend, strict server TypeScript compilation and validation of all four published blog records/covers. No CDN CSS or inline application JS was added. `dist/server.js` is the production entry point; runtime EJS views and public assets must be shipped alongside dist.

## 14. Production-like smoke

A real child process ran the built `dist/server.js` with NODE_ENV=production, explicit canonical origin, a random loopback port and a dedicated temporary root. Analytics was deliberately disabled for this offline smoke. **23/23 checks passed**: all 11 public pages, health/readiness, robots/sitemap, unchanged ads.txt, versioned CSS/JS, invalid analyze input, unauthorized job lookup, unavailable capability file, `.env` and package.json denial. No 5xx was observed. The dedicated smoke root was removed and the child stopped.

This verifies the actual built HTTP entry point and local tool availability. It does not verify Linux SIGTERM behavior: Windows termination is different. Active-analysis drain is unit-tested; PM2/SSE/client disconnect, restart recovery and filesystem/network boundaries must also be tested on the deployment platform.

## 15. Required environment/system configuration

Use `.env.example` plus the reviewed deployment runbook. Production requires `NODE_ENV=production` and explicit `PUBLIC_BASE_URL=https://tiksavemp4.online`. Bind `HOST=127.0.0.1`, choose the Nginx upstream PORT (template 3000), and use `TRUST_PROXY=1` only behind the reviewed loopback Nginx. Configure actual executable paths with `YT_DLP_PATH` (legacy YTDLP_PATH accepted but conflicting values fail), FFMPEG_PATH and FFPROBE_PATH. Set a dedicated DOWNLOAD_TEMP_ROOT outside checkout/static roots. Configure a monitored PUBLIC_CONTACT_EMAIL/LEGAL_CONTACT_EMAIL; the latter takes precedence.

GA_MEASUREMENT_ID is optional and can be blank to disable; its existing value was not changed. Preserve LOG_LEVEL and bounded analysis/download/output/duration/job/file/sweep/concurrency settings unless representative measurements justify changes. Defaults: 2 analyses, 2 download jobs, 4 application operations, 30-second analysis, 120-second download, 600-second video duration, 100 MiB media ceiling, 10-minute records, 60-second file capability, 30-second sweeps. Photos also have independent 35-image, 12 MiB/image, 40-million-pixel, 64 MiB combined and one-archive limits.

Build requires dev dependencies (Sass, esbuild, TypeScript); do not install production-only dependencies before building. After building, runtime needs the declared production dependencies, dist, views, public and validated environment. Node's built-in env-file support is used; no dotenv package is required by this implementation. PM2 and Nginx are system tools, not package dependencies. Chrome impersonation here means yt-dlp/curl_cffi support, not proof a separately installed GUI browser is required by extraction. Local browser tests separately require Playwright's configured Google Chrome channel.

## 16. Manual VPS prerequisites and remediation

Follow DEPLOYMENT.md with explicit owner authorization; none of these operations were run here.

1. Inspect the active PM2 cwd/script/revision and `nginx -T` locally on the VPS without exporting secrets. Determine whether old build files, another checkout/upstream or static crawler-file locations explain the drift. Review/ship the intended release only after the gates below; do not blindly overwrite server changes.
2. As the dedicated unprivileged application user, verify Node 24, install the locked dependencies, run all checks/build/tools:check, and confirm runtime views/public assets are present. Keep one PM2 fork instance; review the 12-second PM2 kill timeout versus the app's 10-second forced-shutdown bound.
3. Have the VPS/network administrator implement a reviewed egress policy for the app UID/process tree/network namespace, covering IPv4/IPv6 private, loopback, link-local, reserved and cloud-metadata destinations. Preserve required DNS and approved public TikTok traffic; test denial using a controlled endpoint owned by the operator, including redirects/DNS changes and yt-dlp children. Record evidence. Exact firewall commands depend on the VPS networking/firewall and must not be guessed remotely.
4. Verify private temp-root ownership/mode, quotas/free space, external port 3000 denial, TLS for both names, renewals, Nginx syntax, overwritten forwarded headers and compression/SSE/media behavior. Reload or restart only after validation and explicit deployment approval.
5. Smoke actual owner-authorized public MP4, MP3 and photo/ZIP sources through the production reverse proxy. Verify contents with full decoding where applicable, actual file sizes/MIME/name, cancellation, expiry, timeout and cleanup. Test graceful SIGTERM and an abrupt restart on a staging/local Linux instance before relying on production recovery.
6. Verify all 11 canonical pages return 200, robots allows versioned assets, sitemap includes all four articles, private/error routes stay noindex/no-store and `/ads.txt` serves unchanged content. Then resubmit the sitemap/inspect selected URLs in the real Search Console property; do not request indexing for redirected or private URLs.
7. Complete operator/legal/consent/GA4 stream reviews, monitored inbox, log rotation/retention, backups/restore and rollback. Use genuine referrals and DebugView to verify attribution; never inject artificial sources, UTMs or sessions.

## 17. Warnings and limits

No actual VPS firewall, Linux permissions, Nginx syntax/certificates, PM2 lifecycle, domain ownership, live upstream TikTok success, Google property settings, AdSense approval or jurisdiction-specific legal suitability was verified. Existing legal pages are expressly operational drafts. Automated axe/Chrome checks do not replace human screen-reader/device testing. Native dependency advisories and TikTok extractor behavior can change after this dated audit. Small controlled synthetic measurements do not establish capacity or uptime.

No speculative cleanup, new feature, article rewrite, homepage metadata change, analytics/publisher change, production mutation or indexing guarantee was made.

## 18. Suggested commit title

`fix: drain analyses on shutdown and serve publisher declaration`

Suggested only. No Git commit or push was created.
