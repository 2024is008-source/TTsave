# TikSaveMP4 production blockers and controlled release plan

Later local implementation update: MP3 verification, startup/controller ownership and the required private dashboard are implemented in [BLOCKER_FIXES_2026-10-28.md](BLOCKER_FIXES_2026-10-28.md). The findings below preserve the earlier failing evidence and live baseline; they do not describe the newer local candidate or certify it deployed. VPS/security/GA4 verification still requires operator evidence.

Review date: October 28, 2026. Scope: unresolved release blockers, deployment identity, live public verification, and recovery. No redesign, push, pull on the VPS, Nginx edit, PM2 restart, or deployment was performed. This supplement supersedes the production-access limitations and administration assumptions in the earlier [final audit](FINAL_SYSTEM_AUDIT_2026-10-28.md); it does not retroactively turn that audit's local results into production results.

**Release decision: do not approve the next production release yet.** A real MP3 request fails, the requested private dashboard is absent, a delayed-client-module check confirms native form navigation to JSON, and the server security/restore gates below still need operator evidence. Advertising must remain off. A missing contact sitemap entry is a release discrepancy, not by itself a reason the existing site cannot operate.

## 1. Production identity is resolved

| Item            | Intended production application                                                                      | Separate preview                                              |
| --------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Repository      | `https://github.com/2024is008-source/TTsave.git`                                                     | `https://github.com/2024is008-source/SaveFrame.git`           |
| Architecture    | Node 24, strict TypeScript, Express 5, EJS, compiled static assets                                   | Next.js 15 / React 19                                         |
| Local checkout  | `D:/My Project/ttdownloder/ttsave/TTsave`                                                            | `D:/My Project/Tiksave`                                       |
| VPS target      | `/var/www/TTsave`                                                                                    | Separate application; do not release here                     |
| Running process | PM2 `ttsave`, online, one fork; `node /var/www/TTsave/dist/server.js`                                | Separate Next process; not TikSaveMP4 production              |
| Nginx upstream  | `http://127.0.0.1:3000`                                                                              | Operator reports separate SaveFrame upstream `127.0.0.1:3001` |
| Revision        | Operator reports `main`, `54d1122`; full local resolution `54d1122c1ca157e98671f4bacad9345c71f98455` | Not a release input                                           |

The VPS paths/process/revision above were supplied by the owner after read-only VPS inspection, not obtained through an SSH session in this audit. Independent public evidence supports them: Express-specific HTML/assets, `/health` 200, `/api/health` 404, and no Next asset markers. All three fetched JS assets match the bytes in TTsave commit `54d1122`. See [public fingerprint](production-blockers/live-fingerprint.json) and [asset hashes](production-blockers/asset-revisions.json). This does not prove that every VPS source/build file is clean or matches that commit; inspect the actual working tree and artifact before release.

Local TTsave HEAD is also `54d1122`, **with a dirty working tree and new untracked implementation files**. Consequently, deploying or pulling that commit alone omits the audited work. The [tracked differences](production-blockers/tracked-difference.txt) and [untracked inventory](production-blockers/untracked-files.txt) are review aids, not an installable or secret-bearing release archive. Build a reviewed candidate that explicitly includes required new files. Do not copy this folder wholesale or mix in Next sources.

## 2. Remaining blockers and exact closure evidence

### B1 — Real MP3 fails locally and in production

The public video from yt-dlp's official regression sources was tested through both local Express HTTP and the actual HTTPS production API. The probe creates only its own bounded jobs; it never uses credentials, private posts, cookies, or restriction bypasses.

| Check                                      | Local audited Express                                  | Live production                     |
| ------------------------------------------ | ------------------------------------------------------ | ----------------------------------- |
| Public video analysis                      | Video, two formats, MP3 capability advertised          | Same                                |
| MP4 job preparation and HTTP file response | Ready; HTTP 200; `video/mp4`; attachment; no-store     | Same                                |
| MP4 complete bytes and full FFmpeg decode  | 2,027,898 bytes; Content-Length matched; decode passed | Same                                |
| MP4 authenticated terminal status / replay | `delivered`; replay 409                                | Same                                |
| MP3 job                                    | Error `VIDEO_VERIFICATION_FAILED`, before conversion   | Same public error; no MP3 delivered |
| Temporary cleanup                          | Zero entries after isolated local service shutdown     | VPS filesystem not inspected        |

Evidence: [local HTTP lifecycle](production-blockers/http-media-local-final.json), [production HTTP lifecycle](production-blockers/http-media-production.json). The earlier direct-service result is retained in `production-blockers/local-real-media.log`. The manual probe exits nonzero when either format fails. A synthetic MP3 decoder test is not a substitute for this failing real-source path.

Local diagnostic logs show MP3 automatically selects a source advertised as 576×1024; downloaded bytes are a valid MP4 with audio at 540×960, 27.466667 seconds. `src/services/downloader.ts` calls `verifyVideo()` before `convertMp3()`, and `src/services/verify-video.ts` rejects that dimension mismatch. MP4's different selected format passes. Production returns the same failure code, but its internal probe dimensions have not been inspected. This identifies the local failure mechanism, not a claim that every possible upstream MP3 failure has that cause.

Required fix before approval: resolve the automatic audio-source metadata mismatch in Express. Keep duration, size, container, audio-presence and output-MP3 verification intact; never globally disable media verification or silently downgrade a user-selected MP4. Add a regression for this exact source-metadata case, then rerun complete tests and real MP4/MP3 HTTP delivery. A safe audio-specific verification policy or a bounded, verified alternate audio source needs review. No downloader runtime change was made during this review; this remains open.

### B2 — The owner requires a private web dashboard; none exists

The latest explicit decision is **private web dashboard required**. The old removal decision is no longer the target requirement. `src/app.ts` deliberately returns 404 under `/admin`; live `/admin` and `/admin/login` also return 404, no-store and noindex. Optional operational analytics/GA4 CLI reports are implemented locally but do not meet this dashboard requirement.

Before treating the full system as complete, implement a separate authenticated private surface in Express, preserving the public website. Minimum acceptance criteria:

- Server-enforced authentication and authorization on every dashboard page, reporting API and export; HTTPS-only secure HttpOnly sessions, session rotation/expiry/revocation, CSRF protection for mutations, bounded login attempts and a reviewed MFA/access-gateway arrangement. No hardcoded password or reuse of download capability tokens as admin credentials.
- Read-only download counts distinguish attempts, prepared files and confirmed server delivery; show MP4/MP3/image/ZIP separately. Label job totals as jobs, not unique users or files saved to a device. Show tracking start and retention limits; never invent historical data.
- Country reports label unknown as `XX`, distinguish GA4's consent-limited geography from verified proxy-derived server aggregates, and do not promise to identify all visitors. Keep `TRUST_COUNTRY_HEADER=false` until the edge source is reviewed.
- Reuse the tested operations reporting service behind authorization; keep databases, keys and GA4 service credentials outside Git/web roots. Exclude raw TikTok links, signed capabilities and unnecessary personal data from reports and exports.
- Private noindex/no-store responses; no GA4 or advertising on admin/auth/errors. Regression tests cover unauthenticated/expired/forged sessions, cross-user/role authorization, CSRF, brute-force limits, logout, and report integrity. No public navigation redesign is needed.

Implementation, credential/bootstrap method and authenticated staging acceptance remain open. This audit does not create an unaudited login page simply to make `/admin` return 200.

### B3 — Local release fixes are not the live artifact

| Relevant fix                                                   | Local TTsave evidence                                                                                   | Commit `54d1122` / live evidence                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public-photo fallback, same post ID, restricted-post rejection | `src/services/photo-metadata.ts`; prior actual photo/ZIP local verification                             | Already present in `54d1122`; not a missing Next migration. VPS photo delivery/cleanup still needs a live smoke                                                  |
| Preview Back/Close/Escape fix                                  | Separate Next `public/saveframe.js` only                                                                | Express uses a thumbnail/result workspace, not that Next video modal. Do not port its history code into Express without a reproduced Express defect              |
| Consent-gated GA and delivered-download events                 | `views/partials/head.ejs`, `public/assets/js/analytics.js`, frontend adapter/state machine; regressions | Live analytics/downloader JS match `54d1122`, differ from local; live HTML includes Google SDK directly; live analytics lacks consent key and `download_success` |
| Server delivery/country reports and recovery consistency       | New operational analytics/GA4 reporting services, API observers, CLI and tests                          | New files are untracked locally, absent from baseline; activation/storage/settings on VPS unknown                                                                |
| Monetag orchestration                                          | New validated default-off configuration, loader, exclusions, exact-origin CSP, inert fixture tests      | Not present at baseline; no advertising initializer/provider scripts observed live                                                                               |
| Forwarded country spoof protection                             | Local Nginx template overwrites country with `XX`                                                       | Two-line local addition; active installed headers not supplied                                                                                                   |
| Homepage description                                           | Local removes unconditional watermark-free claim                                                        | Live retains old claim; deploy corrected metadata with reviewed candidate                                                                                        |
| Responsive image variants                                      | Local generated sizes/templates/build step plus regression checks                                       | Local optimization diff; no redesign or architecture migration needed                                                                                            |
| Strict MP3 input/output verification                           | Current service and verifier                                                                            | No change from baseline; real failure B1 exists in both                                                                                                          |

Do not mark a fix deployed because it exists in this working tree. New manifest/config files and tests are as important as tracked diffs. A release must have a reproducible identifier and checksums of its built artifact.

### B4 — VPS security and recovery gates remain unverified

Reviewed local PM2 template: `/var/www/TTsave`, `dist/server.js`, Node env-file at that path, one fork, port 3000, loopback bind, canonical HTTPS base, 12-second kill timeout versus application 10-second shutdown deadline. In-flight jobs are ephemeral and are cancelled on shutdown; a restart is not transparent transfer resumption. The owner confirmed the running process/upstream, not all environment values, service ownership, limits or reboot recovery.

Reviewed local Nginx template: fixed Host/X-Forwarded-Host, overwritten X-Forwarded-For, scheme-derived X-Forwarded-Proto, country `XX`, disabled proxy cache/buffering, bounded request size/timeouts, URL/query-free access-log format. Express trusts only loopback when enabled. Live observed HTTP/www redirects are 301; the candidate template uses 308, so do not claim it is the installed configuration. A response discloses nginx/1.24.0 Ubuntu; version exposure alone is not the release blocker.

Required operator closure evidence:

1. Active target server block and `nginx -t` pass; correct HTTPS origin certificate/renewal and fixed upstream; Node 3000 inaccessible externally. Inspect locally, do not export full `nginx -T`, PM2 environment or `.env` contents into a public report.
2. Effective production environment validates `NODE_ENV=production`, `HOST=127.0.0.1`, `PORT=3000`, `PUBLIC_BASE_URL=https://tiksavemp4.online`, `TRUST_PROXY=1` (implemented as loopback trust), verified tool executable paths and private owned temporary storage. Preserve the existing `G-XP63QEZK1R`; set `GA4_REQUIRE_CONSENT=true` for the candidate. Keep all four advertising flags false. Keep trusted-country headers off pending edge review. `.env` mode 0600; private data/temp directories mode 0700. Never publish secret values.
3. Enforced and tested application-user/process-tree egress restrictions cover yt-dlp/FFmpeg children, IPv4/IPv6, private/loopback/link-local/metadata destinations, redirects and DNS changes. Node's own public-DNS pinning does not contain child-process networking. No firewall rule installation or remote test was performed by this audit.
4. Cloudflare status/settings are unknown. Public DNS/header observations do not establish proxying mode. If used: Full (strict), valid origin certificate, reviewed origin restrictions and cache bypass for API, previews, SSE, downloads, readiness, admin/auth, errors and private ad bootstrap. Accept CF-Connecting-IP only from current verified Cloudflare ranges in Nginx; never trust all sources. Without reviewed real-IP handling, shared edge addresses can share rate-limit buckets. Preserve the Express loopback boundary.
5. Validate limits on the actual VPS with one approved job at a time before a bounded concurrent test; monitor CPU, memory, disk and temp cleanup. Test cancellation, expiry, failure, disconnected delivery, graceful shutdown and reboot recovery without interrupting real users. Verify log rotation/restricted access and short retention.
6. Back up and restore the actual artifact/configuration and any enabled operations key/database consistently, in isolation. An actively written SQLite main file alone is insufficient; use a tested SQLite backup or quiesce the app and preserve sidecars/key together. Never back up temporary media. No restore drill was performed here.

### B5 — Submitting before the client module is ready navigates to JSON

The full browser rerun failed `photo-repeat.spec.ts`, 390×844: after clicking Get video, `#photo-position` never appeared and the document contained the analysis JSON. The failure is preserved in [the original context](production-blockers/photo-repeat-failure.txt). This was not a failed image decode or proof of upstream unavailability; the test uses inert routed responses.

A separate controlled local browser check delayed only the downloader module, confirmed the submit button was enabled, submitted a fixture URL and observed a **navigation request** to `/api/v1/analyze`. It produced the raw JSON document. See [controlled reproduction](production-blockers/form-readiness.json). No TikTok provider was contacted in this check. The server-rendered form has `method=post` and `action=/api/v1/analyze`, while `app.js` dynamically imports the code that attaches the submit handler. Without that handler, the native form action remains active. These files are unchanged from baseline `54d1122`; production has the same relevant source/asset pattern, but no production-browser timing fault was induced here.

Required closure: prevent native submission until the handler is attached, or implement a real safe HTML fallback, with an accessible module-failure/no-JavaScript message. Keep public layout unchanged; no inline script or CSP weakening is needed. Add a deterministic regression that holds the module response pending, attempts submission, then releases it and confirms the regular flow works without document navigation. Do not close this finding by merely waiting longer in the existing test or adding retries. No runtime fix was made during this review.

## 3. Actual public SEO and GA4 verification

Completed live: all 11 public pages fetched return 200 with one H1, unique titles/descriptions, fixed apex HTTPS canonicals and index/follow; all four published blog articles are present. Robots advertises the fixed sitemap and excludes private/API/health paths. HTTP apex and both www variants redirect to the HTTPS apex. `/ready` returns 200. Admin errors are noindex/no-store with no Google/ad tags. See [live crawl](production-blockers/live-crawl.json).

Remaining release differences: the live sitemap contains 10 entries and omits the existing 200 `/contact` page; local sitemap coverage is 11. The live homepage description still promises videos without watermark. These are metadata/sitemap discrepancies to include in the next approved release, not evidence of a site-wide indexing outage. Search Console indexing, selected canonical, sitemap processing and field Core Web Vitals are not accessible here. No rankings or indexing guarantee is made.

Live measurement ID is `G-XP63QEZK1R`. The old SDK is directly included before the local candidate's consent gate; `download_success` is absent in the live client. Before deploying an analytics-enabled release, verify real consent behavior in a fresh browser and Google stream settings with account access: Enhanced Measurement off, no extra destinations/automatic user-data collection, no duplicated manual page views, no raw source URLs/query tokens/media titles in payloads, and one delivered-download event only after server confirmation. Verify decline causes no Google requests and downloader still works. Property permissions, Data API credentials, retention and DebugView/report collection are unverified. Public ID presence does not certify ingestion or accurate country totals.

## 4. Monetag remains an activation gate, not a reason to block an ad-free release

Keep `ADVERTISING_ENABLED=false`, `MONETAG_IPP_ENABLED=false`, `MONETAG_VIGNETTE_ENABLED=false`, `MONETAG_MOBILE_ENABLED=false`. Official tags/zone IDs/origins have not been supplied. No invented provider URL/ID or wildcard ad CSP was introduced. Placeholder manifests are empty and unreviewed; they are not working tags. Local tests use inert fixtures.

The local architecture is ready for a separately reviewed official-tag/CMP setup, not real-ad activation. Verify separate advertising consent, partner/privacy disclosures, exact required CSP origins, once-only tags, withdrawal behavior and real mobile creative interference/performance before enabling. No OnClick/popunder or notification format should be enabled. Absence of ad scripts in the live HTML is verified; effective private environment flags on the VPS remain operator-verification items. See [advertising guide](ADVERTISING.md).

## 5. Repeated local verification

The current run's authoritative logs are `production-blockers/check.log` and `production-blockers/browser.log`. Test results are recorded below when the complete run finishes; earlier mixed-run coverage is not relabelled as a new full pass. The manual real-media probe is separate from fixture-driven regression suites and currently fails for MP3 even if those suites pass.

| Check                                              | Result from this review                                                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                    | Passed: lint, strict types, 445 unit tests, 200 integration tests, build, four published-blog validations; `production-blockers/check.log`              |
| Final `npm run check` after adding the audit tools | Passed again: lint, strict types, 445 unit tests, 200 integration tests, build and four blog validations; `production-blockers/final-check.log`         |
| Complete `npm run test:ui`                         | **111 passed, 1 failed**, all 112 cases executed in one run, 7.4 minutes; `production-blockers/browser.log`. Failure is B5; no test skipped or weakened |
| Controlled delayed-module browser reproduction     | Confirms native navigation to JSON; B5 remains open                                                                                                     |
| Real public HTTP media probe                       | MP4 passes locally and on production; MP3 fails on both; B1 remains open                                                                                |
| `npm run tools:check`                              | Local yt-dlp, FFmpeg, ffprobe, Chrome target and MP3 encoder checks all true; `production-blockers/tools.log`                                           |
| `npm audit --json`                                 | Zero known findings; `production-blockers/dependencies.json`                                                                                            |
| Formatting and diff whitespace                     | Final `format.log` and `diff-check.log` recorded after report completion                                                                                |

The browser run is not green. Its responsive sweep passes all 11 public URLs at 320, 375, 390, 768, 1024 and 1440 pixels; that does not cancel the startup race. Automated ad-consent, duplicate-script and exclusion checks pass with inert fixtures. No real advertising, physical-device or VPS capacity/performance certification is inferred.

New review tools: `scripts/verify-http-media.mjs` (local or fixed production target, Zod contracts, bounded jobs/files, full decode, authenticated delivered status, replay rejection, own-job cancellation and guarded temp cleanup) and `scripts/audit-release-assets.mjs` (read-only public hashes against the reported VPS commit). The former requires a build and local FFmpeg even when testing production. Neither deploys, mutates infrastructure or accepts arbitrary target origins. Avoid logging or sharing capability URLs. A production smoke creates real test jobs and can add real analytics counts if server counters are enabled.

## 6. Exact deployment checklist — future operator procedure only

**None of the mutation commands below were executed. Do not execute the switch/restart until explicit deployment approval and B1–B5 closure.** Run as the same dedicated PM2 owner, with only necessary elevation for preflight. Never run `pm2 restart all`, replace the SaveFrame service, or change the separate port 3001 upstream.

### A. Freeze and identify the release

- [ ] Close B1 with real MP3 delivery, B5 with the module-readiness regression, and B2 with authenticated dashboard acceptance in an isolated Express candidate. Confirm legal operator/contact/retention disclosures for actual enabled processing. Keep ads off.
- [ ] Review tracked and untracked changes. Produce a complete reviewed release/artifact with full candidate SHA and checksums, package lock, generated assets and views; exclude `.env`, keys, publisher tags, service-account JSON, `.data`, temp media, node_modules and audit media. No automatic commit/push is authorized by this audit.
- [ ] Prepare an isolated Linux candidate at `/var/www/TTsave-candidate-<release-id>`, not in the live directory. Install Node 24/npm 11 and tool paths. Use staging-only private data/temp roots, no production operations DB and no publicly bound test port. Populate its environment privately, never via pasted secrets.
- [ ] In candidate: `npm ci`, `npm run check`, `npm run test:ui`, `npm run format:check`, `npm audit`, `npm run tools:check`. Install approved Chrome/Playwright prerequisites before browser tests. Record Linux results, artifact checksums and full candidate SHA. Do not infer Linux success from Windows results.
- [ ] Run `node --env-file-if-exists=.env scripts/verify-http-media.mjs local '<approved-public-video>'` and the existing photo/ZIP verifier with an owner-approved source. Both media types must actually decode. The local command starts its own ephemeral loopback Express server and private temporary root. Do not run a failed real-source check as an accepted warning.

### B. Read-only production preflight before approval

```bash
cd /var/www/TTsave
test "$(pwd -P)" = /var/www/TTsave
node --version
npm --version
git remote get-url origin
git rev-parse HEAD
git status --short
pm2 describe ttsave
curl --fail --silent --show-error http://127.0.0.1:3000/health
curl --fail --silent --show-error http://127.0.0.1:3000/ready
sudo nginx -t
```

Inspect command output privately. Stop on a different repository, unexpected dirty VPS files, wrong cwd/script, multiple workers, wrong bind/upstream or unhealthy response. Record sanitized provenance only. Verify the actual PM2 owner's environment precedence (`--env-file` does not override an existing process variable), Node interpreter path, private storage/permissions, and production flags. Do not dump `pm2 env`, `jlist` or `.env`. Confirm the candidate fully includes local fixes and the admin implementation; baseline `54d1122` alone is not the candidate.

### C. Backup, drain and approved switch

- [ ] Record the exact running artifact, full Git SHA/dirty status, package lock, Node/tool versions, PM2 process configuration/startup registration, active Nginx files and environment backup in restricted storage. Capture a snapshot of the running built files; rebuilding commit `54d1122` later is not an identical backup.
- [ ] Choose a maintenance window. Stop admitting new work with the existing reviewed maintenance mechanism; let active deliveries finish, then confirm no queued/active jobs. If there is no tested drain/maintenance mechanism, establish one in staging first; do not invent a live Nginx edit in this runbook. A PM2 restart immediately invalidates ephemeral jobs.
- [ ] Quiesce the application after explicit approval. Make a consistent private operations database/key backup if enabled; test its restore on isolated storage. Keep application data and temporary media separate. Preserve any actual enabled runtime data/config paths when preparing the candidate `.env`; do not carry staging paths into production.
- [ ] Use the guarded directory switch below only if all three paths have been reviewed as real directories on the same filesystem (no symlinks), the backup path does not exist, and candidate runtime config has been validated. Fill the release ID with the approved artifact identifier. Do not execute with the placeholder still present.

```bash
# EXAMPLE FOR THE APPROVED MAINTENANCE WINDOW ONLY.
set -eu
release_id='REPLACE_WITH_APPROVED_RELEASE_ID'
test "$release_id" != REPLACE_WITH_APPROVED_RELEASE_ID
case "$release_id" in ''|*[!a-zA-Z0-9_-]*) exit 1 ;; esac
app=/var/www/TTsave
candidate="/var/www/TTsave-candidate-$release_id"
rollback="/var/www/TTsave-rollback-$release_id"
test -d "$app" && test ! -L "$app"
test -d "$candidate" && test ! -L "$candidate"
test ! -e "$rollback"
test "$(realpath "$app")" = "$app"
test "$(realpath "$candidate")" = "$candidate"
test "$(stat -c %d "$app")" = "$(stat -c %d "$candidate")"
test -f "$candidate/dist/server.js"
test -f "$candidate/.env"
test -f "$candidate/ecosystem.config.cjs"
# Backups, .env permissions/values and zero active transfers were verified above.
pm2 stop ttsave
mv -T -- "$app" "$rollback"
if ! mv -T -- "$candidate" "$app"; then
  mv -T -- "$rollback" "$app"
  pm2 restart ttsave --update-env
  exit 1
fi
cd "$app"
pm2 restart ecosystem.config.cjs --only ttsave --env production --update-env
curl --fail --silent --show-error http://127.0.0.1:3000/health
curl --fail --silent --show-error http://127.0.0.1:3000/ready
```

Do not install or rebuild in the live directory during the switch. Confirm PM2 still has one `ttsave` fork with the expected script/cwd. The existing port 3000 upstream needs no Nginx change or reload. If a separately reviewed Nginx change is later necessary, obtain permission, keep the current file backup, pass `nginx -t` and reload only after reviewing its full diff. Preserve the separate SaveFrame configuration.

### D. Acceptance before reopening traffic

- [ ] Repeat actual HTTPS MP4/MP3 HTTP probe: `node --env-file-if-exists=.env scripts/verify-http-media.mjs production '<approved-public-video>'`. Inspect returned MIME, Content-Length, full decode, `delivered`, replay denial. Verify the approved photo/selected ZIP, local VPS cleanup, cancellation, expiry, bad/private inputs and no cached private response. Never publish capability URLs or media as evidence.
- [ ] Fresh and previously cached browser sessions receive the intended release assets. Current app.js imports downloader with a fixed query version and assets have one-hour caching: version/invalidate the changed downloader module URL in the candidate before release, and test the existing-browser upgrade. The analytics initializer already has a new candidate query version. Purge only relevant CDN objects if used; a CDN purge does not erase visitors' browser caches.
- [ ] HTTPS redirects, health/readiness, 11 sitemap URLs including `/contact`, canonical metadata, four articles, new description, admin authentication/noindex/no-store and all assets pass. Test dashboard login/logout/expiry, report totals/countries and unauthorized private API access.
- [ ] Verify GA4 consent/decline and collection payloads with authenticated property access; preserve the ID. Confirm no duplicate SDK/page-view/download events and no scripts on admin/auth/errors. Confirm no Monetag requests at all.
- [ ] Check actual resource usage, log sanitization/rotation and temp/disk state; restore traffic only after acceptance. Save the validated PM2 process list with `pm2 save` after approval, never while a failed candidate is active. Record full deployed artifact identifier and test timestamps.

## 7. Rollback plan — retain the captured artifact

Trigger rollback if the new process fails readiness, real MP4/MP3/photo delivery regresses, dashboard authorization fails, private responses cache, consent or ad behavior is wrong, assets mismatch or resource usage exceeds the reviewed budget. Keep maintenance/drain active, stop `ttsave`, preserve restricted diagnostics without tokens, and retain the failed artifact for diagnosis. Do not restart all PM2 processes or touch port 3001.

The directory switch above retains the exact previous app at `/var/www/TTsave-rollback-<release-id>`, including its matching environment. Restore that artifact rather than building arbitrary `main` or using `git reset --hard`. Example, after checking paths and explicit rollback authorization:

```bash
set -eu
release_id='REPLACE_WITH_APPROVED_RELEASE_ID'
test "$release_id" != REPLACE_WITH_APPROVED_RELEASE_ID
case "$release_id" in ''|*[!a-zA-Z0-9_-]*) exit 1 ;; esac
app=/var/www/TTsave
rollback="/var/www/TTsave-rollback-$release_id"
failed="/var/www/TTsave-failed-$release_id"
test -d "$app" && test ! -L "$app"
test -d "$rollback" && test ! -L "$rollback"
test ! -e "$failed"
test "$(realpath "$app")" = "$app"
test "$(realpath "$rollback")" = "$rollback"
test "$(stat -c %d "$app")" = "$(stat -c %d "$rollback")"
test -f "$rollback/dist/server.js"
test -f "$rollback/.env"
pm2 stop ttsave
mv -T -- "$app" "$failed"
if ! mv -T -- "$rollback" "$app"; then
  mv -T -- "$failed" "$app"
  exit 1  # Keep stopped/maintenance active; operator review is required.
fi
cd "$app"
# Review restored runtime environment; keep all advertising disabled.
pm2 restart ttsave --update-env
curl --fail --silent --show-error http://127.0.0.1:3000/health
curl --fail --silent --show-error http://127.0.0.1:3000/ready
```

Restore the previous matching PM2 environment if it changed; `--update-env` alone does not purge stale variables from PM2's stored environment. Validate effective values privately. No Nginx restoration is needed when it was unchanged. If an approved config update was applied, restore its captured counterpart, run `nginx -t`, then reload only that service with permission. No data migration is part of this review; if the future dashboard introduces one, require a separately tested downgrade/restore plan before release. Preserve current operational data unless compatibility demands restoring a backup; document any loss window, never silently roll counters backwards. Old baseline functionality already has the known MP3 failure: rolling back restores that baseline, not a claim that it fixes B1. Expired jobs cannot be resumed.

After rollback, repeat public health/readiness, redirects, assets, known-good MP4 delivery, photo/ZIP, private cache/auth checks and ads-off verification. Record whether the known baseline MP3 error remains. Keep the previous consent/privacy limitations explicit. Reopen traffic only after the owner accepts the restored baseline, then save the validated PM2 list. Retain both artifacts/backups until the incident is resolved; no deletion commands are required.

## 8. Files changed by this production review

- `docs/PRODUCTION_BLOCKERS_2026-10-28.md`: this blocker-only review, verified architecture comparison, deployment acceptance gates and guarded rollback plan.
- `docs/ANALYTICS.md`, `docs/DEPLOYMENT.md`, `docs/LAUNCH_CHECKLIST.md`: link the latest production evidence and record the newly required private dashboard without claiming it exists.
- `scripts/verify-http-media.mjs`: repeatable bounded real HTTP MP4/MP3 verification; `scripts/audit-release-assets.mjs`: public asset comparison against reported VPS baseline.
- `docs/production-blockers/`: sanitized public crawl/hash/media evidence, controlled form-race evidence, test/tool/audit logs, read-only crawl helper scripts, and baseline file inventories. `photo-repeat-failure.txt` contains inert test fixture IDs, not real signed media capabilities.

No application source, public layout, Nginx or PM2 configuration was changed by this review. Builds regenerated the existing compiled assets using the already-audited implementation. The broader preexisting working-tree differences are recorded separately; they were not all authored by this review. No Next preview file was changed.

## References checked during review

- [Express reverse-proxy trust](https://expressjs.com/en/guide/behind-proxies/) — proxy header overwrites and trust boundary.
- [PM2 process management](https://pm2.keymetrics.io/docs/usage/process-management/) — process-scoped restart and environment update.
- [Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/) — origin TLS validation when Cloudflare is used.
- [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) — canonical public sitemap URLs; submission is not guaranteed indexing.
- [Official yt-dlp TikTok regression source](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/tiktok.py) — public video used by the bounded real-media probe. Availability is time-dependent.
