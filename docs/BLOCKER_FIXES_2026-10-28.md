# Remaining blocker implementation and production preparation

October 28, 2026. Express TTsave only:
`D:/My Project/ttdownloder/ttsave/TTsave`. Intended production target:
`/var/www/TTsave`, PM2 `ttsave`, one fork, loopback port 3000, Express/EJS/TypeScript.
No Next.js/SaveFrame file, production VPS, Nginx setting or running PM2 process was
changed. No commit, push, production pull or deployment was performed.

This report updates the local implementation status from
[the cleanup](CLEANUP_2026-10-28.md) and
[production blocker review](PRODUCTION_BLOCKERS_2026-10-28.md). Their old findings
remain historical evidence; local fixes are not automatically deployed fixes.

## 1. Real MP3 verification fixed

The real source selected automatically for audio advertised video dimensions
576×1024 but delivered an MP4 containing 540×960 video and audio. The previous
pipeline enforced the user-selected MP4 dimension contract even when producing
MP3, failing before FFmpeg conversion.

`verifyAudioSource` now validates the actual MP3 input as a video MP4 with audio
and an allowed positive duration. It shares the same bounded FFprobe path with
`verifyVideo`. Video dimensions are enforced when a user selects MP4 output;
they are not an audio-output property. Unsupported/audio-only containers are not
silently accepted, and no arbitrary alternate extractor/format bypass was added.

Before either verifier, the downloader still checks server-owned paths, regular
file/non-symlink status, nonempty content, MP4 signature, per-file/directory byte
limits and cancellation. MP3 conversion still maps the actual audio stream with
the fixed encoder, strips metadata/chapters, verifies a single MP3 audio stream
and duration, checks output/directory size, and cleans the source only after
output verification. Timeouts, concurrency, subprocess `shell:false`, aborts and
single-use delivery remain intact. A failed verifier still fails the job.

Actual public media was processed through the local Express HTTP API, not only a
synthetic fixture. [Live result](blocker-fixes/live-media.json):

| Check                                 | MP4                                         | MP3                                          |
| ------------------------------------- | ------------------------------------------- | -------------------------------------------- |
| Prepared                              | Ready                                       | Ready                                        |
| Delivery                              | HTTP 200, `video/mp4`, attachment, no-store | HTTP 200, `audio/mpeg`, attachment, no-store |
| Complete bytes                        | 2,027,898                                   | 490,646                                      |
| Content-Length and full FFmpeg decode | Passed                                      | Passed                                       |
| Authenticated terminal job status     | `delivered`                                 | `delivered`                                  |
| Reuse of file capability              | HTTP 409                                    | HTTP 409                                     |

The isolated local temporary directory had zero entries after shutdown. No media,
provider URLs or capabilities were retained in the report. This proves the tested
public source's local lifecycle; it does not certify today's unchanged VPS or
every TikTok post. The source is the same public video used in the earlier failing
test, drawn from the official yt-dlp TikTok regression source.

Regression coverage includes the exact mismatch through both the verifier and
the MP3 job pipeline, refusal to downgrade a selected MP4, missing audio/video,
unsupported containers, invalid/excessive duration, conversion/output failures,
attachment delivery and cleanup.

## 2. Startup race and duplicate handlers fixed

A small synchronous external bootstrap installs a capturing submit guard in the
head before the form can accept interaction. The server-rendered submit button
starts disabled; it becomes enabled after that guard exists. Enter and click
submissions cannot navigate to raw API JSON while the asynchronous downloader is
loading or after it fails. Loading, ready and failure messages use the existing
accessible status area. There is no automatic replay/submission of a pasted link.
No inline application code or CSP weakening was introduced. A no-JavaScript
message explains why the downloader needs JavaScript.

Successful controller initialization releases the guard's loading state; module
errors or a loading deadline give a safe refresh message. Bootstrap ownership is
guarded against duplicate installation. The controller's document/instance map is
shared through a symbol across module cache versions, so initializing another
version destroys the previous event handlers instead of running two analyses.
This also preserves existing diagnostic/test imports that use an older cache key.
The new app/downloader query versions invalidate the changed client entry paths.

Three deterministic browser regressions cover a deliberately held module response
plus click/Enter, aborted module load, and two differently versioned module imports
with one submitted analysis. Public styles, typography, artwork and layouts were
not redesigned; only startup readiness/feedback and the no-JavaScript fallback
changed. Existing public interface regressions remain in the suite.

## 3. Private admin dashboard implemented

[ADMIN.md](ADMIN.md) gives the full configuration, route/security model, reporting
semantics and recovery procedure. No real administrator account was configured
by this task. Set `ADMIN_ENABLED=true` only with an operator-selected username and
privately generated hash; default-off routes remain 404 until configured.

Implemented:

- Salted Node scrypt password hashing with bounded cost/concurrency, a hidden-input
  terminal hash generator, no hardcoded account, generic credential failures and
  authentication rate limits.
- Opaque server-side sessions, production Secure/HttpOnly/SameSite=Strict cookies,
  anonymous-to-authenticated rotation, idle/absolute expiry, bounded storage,
  server-enforced authorization, protected logout and synchronizer CSRF/origin
  checks. Restarts revoke sessions. The production referrer policy permits a
  verifiable same-origin form Origin without sending cross-origin referrers.
- Private HTML and `/admin/api/overview`, noindex and private/no-store, script-free
  CSP, no external resources/framing, no public GA4 collector or Monetag loader.
- Actual server job attempts/prepared/delivered/failed totals, per-media outcomes,
  daily activity, retained country aggregates and sanitized processing errors.
  The existing operational collector is reused. Per-media read aggregation now
  includes archived daily totals; no schema migration or duplicate collector.
- Verified process memory/uptime/readiness, existing service queue metrics, native
  tool availability and bounded read-only disk/temp measurements. Tool/storage
  checks are shared/cached for 30 seconds; missing/partial data is labelled.
- Optional existing read-only GA4 Data API reporting for Overview/Countries after
  authentication. No synthetic visitor counts, source URLs, credentials, raw logs
  or sensitive historical page paths are displayed.
- Responsive login/dashboard at 320, 768 and 1440px, keyboard forms/logout,
  descriptive table regions and accessible labels. Browser axe scans and screenshots
  use isolated fixture records; they are not production visitor statistics.

Recorded data is distinct from traffic: delivered jobs do not prove device saves,
job countries are not unique people, `XX` is unknown, and retention/tracking start
are visible. With operational recording disabled or Google credentials missing,
the dashboard says unavailable. No operational database/key/history was reset.

## 4. Regression and security results

| Check                  | Final actual result                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`        | Passed: lint, strict types, **466 unit tests**, **206 integration tests**, production build and four published-blog validations; [final log](blocker-fixes/final-check.log)                             |
| `npm run test:ui`      | **118 passed in one full 9.0-minute run**; [final log](blocker-fixes/browser-final.log)                                                                                                                 |
| Original coverage      | All prior 454 unit, 200 integration and 112 browser cases retained; additions: 12 unit, 6 integration and 6 browser cases. Existing aggregate assertions were extended                                  |
| `npm run format:check` | Passed; [format log](blocker-fixes/format.log)                                                                                                                                                          |
| `npm audit --json`     | Zero known vulnerabilities; [audit](blocker-fixes/dependencies.json). No new dependency or major upgrade                                                                                                |
| Native tools           | yt-dlp, FFmpeg, FFprobe, Chrome target and MP3 encoder available locally; [tool check](blocker-fixes/tools.log)                                                                                         |
| Real local media       | MP4 and MP3 HTTP preparation, complete transfer, full FFmpeg decode, delivered status, replay denial and cleanup passed; [evidence](blocker-fixes/live-media.json)                                      |
| Photos/ZIP             | Successful fresh retry verified all 10 images and three ordered ZIP entries; initial upstream failure retained separately                                                                               |
| Admin browser/security | Login/logout, real isolated store totals, private API rejection, no scripts, no overflow and axe scans pass at 320/768/1440px; native tool checks run locally                                           |
| Public preservation    | **96 protected files unchanged**: public styles/artwork/content, metadata routes, unchanged templates, analytics, deployment templates and lockfile; [hash comparison](blocker-fixes/preservation.json) |
| Secret-pattern review  | Nine redacted leads reviewed as inert test values or code references; no actual account/credential was added. Not an exhaustive Git-history scan; [log](blocker-fixes/secret-scan.log)                  |
| Diff whitespace        | Passed; [log](blocker-fixes/diff-check.log)                                                                                                                                                             |

The fast full-page crawler also exhausted the unchanged real 100/minute test-server
budget in an intermediate run. The SEO/responsive test setup now checks the real
draft-8 remaining/reset header and waits for a fresh budget **before** a test if
needed. The limit is not disabled or raised, client addresses are not spoofed,
and neither assertions nor tested actions are retried. Timeouts account only for
that explicit preflight wait. [Observed header](blocker-fixes/test-budget-header.json).

Additional modified test files: `tests/browser/public-budget.ts`,
`tests/browser/seo.spec.ts`, `tests/browser/responsive-audit.spec.ts`. They honor
the existing real crawl rate budget without weakening production limits or
assertions.

Initial failures are retained in the evidence directory. Browser testing found
and corrected the form Origin/referrer-policy mismatch and cross-version
controller ownership issue. No assertions or old regression cases were removed,
and no retry/wait was added to conceal those defects. One isolated test-launch
attempt encountered an already-owned test port; subsequent isolated checks used
an independent loopback port/output directory. Final suite results below are
reported separately from those development iterations.

The password CLI was exercised in a private PTY with fixture-only input: hash
generated, confirmation successful, plaintext not echoed. No hash/account from
that check was saved as application configuration. Salted hash verification is
also covered by unit tests.

## 5. Preservation and remaining external verification

- Public canonical/meta/robots/sitemap/blog content and URLs are unchanged.
  Admin URLs are private, nonindexable and absent from the public sitemap.
- GA4 measurement/consent/download-event collection is unchanged, and no collector
  runs on admin pages. Actual property permissions, Enhanced Measurement and
  authenticated report ingestion remain unverified without account credentials.
- Monetag support remains intact and disabled: global, IPP, Vignette and mobile
  switches false; official tags/origins and advertising CMP still unavailable.
  Real ads must stay off. Inert regression fixtures are not real creative testing.
- Photo test initially returned `SOURCE_UNAVAILABLE`; one fresh serial attempt
  decoded all 10 images and an ordered selected ZIP (positions 1/6/10, 278,562
  bytes), with zero remaining temporary entries. Both
  [initial](blocker-fixes/live-photos.json) and
  [successful retry](blocker-fixes/live-photos-retry.json) are retained.
- No tests or commands changed production. The live site still runs its previously
  confirmed artifact until an approved release. Exact active environment values,
  HTTPS admin-cookie behavior through Nginx/Cloudflare, IP trust/cache rules,
  child-process egress containment, VPS capacity, private permissions and backup
  restoration still need operator verification. Local Chrome/FFmpeg success is
  not a production load test or field Core Web Vitals result.

The three requested development fixes are implemented locally. Release approval
still requires the remaining actual VPS/security/credential/staging checks;
this report does not authorize or claim deployment.

## 6. Significant modified files

| File                                                                                                                        | Purpose                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/services/verify-video.ts`                                                                                              | Common strict input verification with separate MP4 selection and audio-source contracts    |
| `src/services/downloader.ts`                                                                                                | Use audio-source verification for MP3, retain exact MP4 verification                       |
| `public/assets/js/downloader-bootstrap.js`                                                                                  | Early native-submission guard and accessible loading/failure readiness                     |
| `public/assets/js/app.js`                                                                                                   | Safe async initialization and cache version                                                |
| `src/frontend/downloader.ts`, compiled `public/assets/js/downloader.js`                                                     | Shared cross-version controller ownership                                                  |
| `views/partials/head.ejs`, `views/partials/downloader.ejs`                                                                  | Early external bootstrap, safe initial control state, no-JS feedback                       |
| `src/shared/admin-settings.ts`, `src/config/env.ts`, `.env.example`                                                         | Validated default-off admin settings and private hash setup                                |
| `src/services/admin-auth.ts`, `src/admin-password.ts`, `package.json`                                                       | Passwords, bounded sessions/CSRF and operator CLI                                          |
| `src/services/admin-monitor.ts`                                                                                             | Actual cached tool/system/managed-storage snapshots                                        |
| `src/routes/admin.ts`, `src/app.ts`                                                                                         | Server authorization, private routes/reports, origin/CSRF/rate/header controls             |
| `src/services/operational-analytics.ts`                                                                                     | Reuse stored/archived outcomes for media breakdown; existing totals/distribution preserved |
| `views/admin-login.ejs`, `views/admin-dashboard.ejs`, `views/partials/admin-head.ejs`, `public/assets/admin.css`            | Isolated private responsive UI without public scripts                                      |
| `tests/verify-video.test.ts`, `tests/e2e/mp3.test.ts`                                                                       | Exact failure and safety regressions                                                       |
| `tests/admin-auth.test.ts`, `tests/admin-monitor.test.ts`, `tests/e2e/admin.test.ts`, `tests/operational-analytics.test.ts` | Auth, expiry, CSRF, rate, privacy, monitoring and aggregate integrity                      |
| `tests/browser/admin.spec.ts`, `tests/browser/startup-race.spec.ts`                                                         | Admin layouts/accessibility/logout, delayed/failing/duplicate module regression            |
| `docs/ADMIN.md`, this report, current documentation pointers                                                                | Setup, behavior, real evidence and release gates                                           |

The checkout had substantial prior uncommitted changes. Those changes were
preserved; this table describes the blocker implementation, not every difference
from VPS baseline `54d1122`. No dependency was added for these features.

## 7. Safe VPS deployment plan — future authorized action only

1. **Review the full candidate.** Include all prior audited untracked/dirty files
   and the new modules/templates/assets/tests, not merely commit `54d1122`.
   Produce a reproducible artifact identifier/checksum. No automatic commit or
   push is part of this task.
2. **Confirm the target read-only:** repository TTsave, cwd `/var/www/TTsave`, PM2
   `ttsave`, `dist/server.js`, one fork, Nginx → `127.0.0.1:3000`. Leave the separate
   SaveFrame/Next process and port 3001 unchanged. Inspect sanitized provenance,
   not a shared dump of PM2 environment or credential files.
3. **Prepare an isolated Linux candidate**, outside the live directory, Node 24,
   existing lockfile/tool paths, private staging temp/data roots. Run
   `npm ci`, `npm run check`, `npm run format:check`, `npm run test:ui`,
   `npm audit`, `npm run tools:check`. Verify the real approved video/photo sources
   with the existing local media verifiers. Do not point staging at the active
   operations DB or temporary root.
4. **Configure privately**, using [ADMIN.md](ADMIN.md): choose the username, generate
   the hash interactively, keep `.env` mode 0600, enable operational recording only
   deliberately, reuse existing production keys/data and optionally configure the
   authorized GA4 reader. Keep all four ad flags false. Production requires
   `NODE_ENV=production`, loopback host/port, fixed canonical origin and reviewed
   loopback proxy trust. Never weaken Origin/cookie protections to make staging
   login work: exercise production admin through an isolated origin-matched HTTPS
   staging route/hosts mapping approved by the operator. Local HTTP test cookies
   are not production-cookie certification.
5. **Verify actual VPS gates:** `nginx -t`, TLS/renewal, Node port privacy, trusted
   IP/header handling, Cloudflare Full (strict)/private cache bypass if used,
   application/process-tree egress containment, permissions, disk/resource limits,
   log rotation and an isolated consistent backup restore. Keep geography trust
   off until a reviewed edge map overwrites the header. Do not install or edit
   these settings automatically.
6. **Take matching backups and request release approval.** Preserve the current
   built artifact, configuration and private environment, plus operations key/DB
   consistently (or quiesced with sidecars). Keep temporary media out of backups.
   A backup rebuilt from an arbitrary branch is not the captured running artifact.
7. **Only after permission**, drain incoming work and finish active transfers,
   then use the guarded candidate-directory switch/rollback in
   [the production runbook](PRODUCTION_BLOCKERS_2026-10-28.md). Restart only `ttsave`
   using its reviewed ecosystem/environment; no `pm2 restart all`. The port 3000
   upstream is unchanged, so these code changes require no Nginx edit/reload.
   Verify effective PM2/env-file precedence privately. Restart revokes admin
   sessions and ephemeral download capabilities; it is not transparent resumption.
8. **Post-release acceptance before reopening traffic:** health/readiness, real
   HTTPS MP4 and MP3 full decoding/delivery/replay denial, photo/ZIP, expiry,
   cancellation and cleanup; correct new asset URLs/cache behavior; HTTPS admin
   Secure/HttpOnly/Strict cookies, login/logout/expiry, forged-session/CSRF/API
   rejection, private cache/noindex/no-script headers, real report integrity;
   unchanged SEO/blogs/11 sitemap URLs; GA4 consent and authenticated reporting
   with actual account access; zero Monetag requests. Record actual results and
   artifact identity, then save the validated PM2 state with permission.

### Rollback

Keep the maintenance/drain mechanism active, stop only `ttsave` with permission,
and restore the captured previous artifact with its matching configuration and
reviewed effective environment. Preserve the failed candidate for restricted
diagnosis. The existing guarded directory rollback procedure applies; do not
`git reset --hard`, pull a random branch, recursively delete directories or rebuild
over the live tree. Nginx restoration is unnecessary when it was not changed.

This implementation adds no persistent schema migration. Keep the existing
operations DB/key/history; restoring an older database without need can lose
recent counts. Restarted sessions/jobs do not resume. Validate health/readiness,
assets, known baseline media behavior, private route/cache protections and ads-off
state before the owner accepts the restored baseline. The previous artifact may
restore the old MP3/startup/admin limitations, which must be stated rather than
called fixed by rollback. Retain backups and both artifacts until acceptance;
no production deletion command is required.
