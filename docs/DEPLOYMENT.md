# Ubuntu deployment and recovery

**Current release procedure:** use [RELEASE_2026-10-28.md](RELEASE_2026-10-28.md)
for the reviewed candidate, explicit Git manifest, staging, admin setup and
approved switch/rollback. The procedures and production observations below are
historical context; they do not authorize any live command or describe the new
candidate as deployed.

The owner confirms the website is **not connected to Cloudflare**. Use the current
direct Nginx/TLS release checklist; Cloudflare sections below are conditional
historical guidance, not active deployment requirements.

New local candidate: read [the blocker implementation report](BLOCKER_FIXES_2026-10-28.md) and [private admin setup](ADMIN.md) before staging. MP3/startup/admin development fixes are implemented locally; the earlier production observations below still describe the unchanged live artifact. Do not restart or deploy without permission.

Current release gate: read [the October 28 production blocker review and exact switch/rollback procedure](PRODUCTION_BLOCKERS_2026-10-28.md) first. The owner has confirmed production is Express TTsave at `/var/www/TTsave`, PM2 `ttsave`, port 3000, commit `54d1122`. Local fixes are uncommitted; that baseline alone is not the audited release. Real production MP4 passed, MP3 failed, and a private dashboard is required but absent. The review supersedes older architecture/access/admin assumptions below; no deployment has been authorized.

Prepared October 9, 2026. This is a runbook, not evidence of deployment. Local tests run on Windows; Ubuntu, PM2 and Nginx have not been accessed. Do not launch until every production gate in LAUNCH_CHECKLIST.md is verified.

## Environment and ownership

Use Node.js 24 LTS and one dedicated unprivileged application user. Checkout path: `/var/www/TTsave`. Keep `.env` outside Git, owned by that user, mode 0600. Begin with `.env.example`, then set:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
PUBLIC_BASE_URL=https://tiksavemp4.online
PUBLIC_CONTACT_EMAIL=tiksavemp4@gmail.com
LEGAL_CONTACT_EMAIL=tiksavemp4@gmail.com
TRUST_PROXY=1
LOG_LEVEL=info
YT_DLP_PATH=/usr/local/bin/yt-dlp
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
DOWNLOAD_TEMP_ROOT=/var/lib/ttsave/tmp
```

Executable paths are examples: verify their actual installation paths, executability and versions on the VPS. `YT_DLP_PATH` supports the legacy `YTDLP_PATH` alias; conflicting settings fail. Set both contact variables to the official address shown above; LEGAL_CONTACT_EMAIL takes precedence. After deploying the environment update, run `pm2 restart ttsave --update-env`. Never put credentials, cookies or signed URLs into this file or audit evidence. Create the temporary root owned by the application user, mode 0700, outside the checkout; never use a shared root or web-served directory.

Retain the example's duration, byte, TTL, timeout and concurrency limits until a representative VPS load test supports a change. Two downloads/conversions and four application operations are the defaults. MP3 requires libmp3lame and ffprobe. Run `npm run tools:check` after configuring paths; verify MP3 capability separately from liveness. Tools must be current, but upgrades need a smoke test.

## Network security prerequisite

Node thumbnail requests validate every redirect, pin public DNS answers and enforce byte/time limits. yt-dlp runs in a child process and performs its own DNS and media redirects. URL allowlists alone cannot contain child-process SSRF. Before public access, configure and test OS/network egress restrictions for the application user/process tree: block private, loopback, link-local, multicast, reserved and metadata destinations in IPv4 and IPv6, including redirects and DNS changes. Allow the public destinations/protocols actually needed by supported TikTok extraction. Validate this policy with a controlled endpoint you own; never probe third-party internal systems. This repository does not install an egress policy, so this remains a launch blocker.

Expose only Nginx on 80/443, plus administratively restricted SSH. Verify external TCP 3000 is unreachable and `ss -ltnp` shows Node listening only on 127.0.0.1:3000. One local Nginx overwrites forwarded headers; Express trusts only loopback peers. If adding another proxy, reassess this trust boundary.

## DNS, certificates and Nginx

The October 9 observation of forwarding/parking is historical. The October 20 read-only audit reached an Nginx-served application at the apex and working permanent redirects from the HTTP/www variants; both names resolved to the same IPv4 address. However, live blog routes and robots/sitemap content differ from the current repository. See [TECHNICAL_SEO_AUDIT_2026-10-20.md](TECHNICAL_SEO_AUDIT_2026-10-20.md). Inspect the active release, PM2 working directory and Nginx locations before changing DNS; do not replace functioning DNS based on the old parking observation. For a new or corrected deployment, point apex A (and AAAA only if IPv6 is configured) records to the actual VPS and point www to that deployment. Obtain and validate a certificate covering BOTH names before enabling the HTTPS blocks in `deploy/nginx/ttsave.conf`. For initial HTTP ACME issuance, enable only its port 80 server with the challenge webroot; do not enable certificate paths that do not exist. Verify renewal and perform a renewal dry run.

Review the template against installed Nginx and site layout, then install in sites-available and enable through sites-enabled. Remove conflicting default/parking server blocks only after inspecting the active config. The template redirects both HTTP names and HTTPS www to fixed HTTPS apex, proxies to loopback, disables buffering/cache for SSE and media, and enables text compression. TLS files and syntax are UNVERIFIED here.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Never reload if syntax validation fails. Test all three redirect entry points and HTTPS apex, robots, sitemap, legal pages, 404, `/health` and `/ready`. Both readiness and a real download are required. TLS must validate without `-k`. Confirm forwarding spoof attempts cannot alter public URLs or bypass per-client limits.

## Install, startup and verification

Inspect `git status` and record `git rev-parse --short HEAD`; preserve local server changes before updating. Run as the dedicated application user with the approved Node version:

```bash
cd /var/www/TTsave
node --version
npm ci
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run tools:check
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save
pm2 status
pm2 logs ttsave --lines 100 --nostream
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/ready
```

The ecosystem uses lowercase `ttsave`, fork mode, ONE instance and 12 seconds termination grace (server shutdown grace is 10 seconds). Jobs and rate budgets are in memory; clustering or multiple copies would break ownership/rate limits. A restart cancels jobs and invalidates existing capabilities. Run PM2 startup registration for the correct user and Node path, follow its generated administrative command, save, and verify after reboot. Do not copy a different user's generated startup command.

Use an owner-authorized public TikTok video to test analysis, returned quality, a fully decoded MP4 and MP3, real preview, cancellation and unavailable/restricted cases. Inspect temp cleanup after delivery, failure and restart. Do not publish source URLs, media, cookies or signed URLs as evidence. Synthetic fixtures do not establish upstream availability.

## Operations, privacy and rollback

Configure PM2 and Nginx log rotation, restrictive log access and a documented short retention period. Nginx access logs deliberately omit URLs, queries and headers; IPs remain necessary security data. Critical Nginx error records may still include request context, so restrict access and never export raw logs as public evidence. Application logs use fixed route labels and sanitized error categories. Optional GA4 is enabled only by `GA_MEASUREMENT_ID`. Before setting it, disable Enhanced Measurement in the Google web stream and confirm retention and consent arrangements using [ANALYTICS.md](ANALYTICS.md). Monetag scaffolding is included but must remain disabled; see ADVERTISING.md.

Monitor health/readiness failures, process restarts, queue rejection, disk free space, stale temporary files and TLS expiry. `/health` is liveness, not proof TikTok is reachable. Test resource behavior on the actual VPS with approved sources; local CPU/RSS numbers are not sizing guarantees. Temporary media must never be backed up or served statically.

Back up the exact release revision, package lock, reviewed Nginx/PM2 config and encrypted environment separately. Test restoration without exposing secrets; include contact/legal content, exclude temporary media. Keep a previous built release and known-good configuration. Rollback: stop accepting work, let/cancel active jobs, restore the known-good release/config (preserving `.env`), run `npm ci` and `npm run build`, then restart the one PM2 process. Validate health/readiness and downloads. For Nginx rollback, restore its reviewed config and run `nginx -t` before any reload. Record the deployed revision and rollback result.

Configuration references: [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/), [PM2 ecosystem fields](https://pm2.keymetrics.io/docs/usage/application-declaration/), [Nginx proxy buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

## Photo deployment checks

The selected-image ZIP writer requires no additional executable or dependency. Existing Sharp validates images and creates small previews. Keep the same Node.js 24, yt-dlp, FFmpeg/FFprobe, Chrome, PM2 single-process and loopback-only Nginx setup. No Docker files were added.

Photo limits: 35 images; 12 MiB and 40 million decoded pixels per image; 64 MiB combined bytes; complete output additionally bounded by `DOWNLOAD_MAX_BYTES`; one concurrent archive; sequential image retrieval; 60-second photo processing deadline (or configured `DOWNLOAD_TIMEOUT_MS` if lower). Preview memory holds at most 32 entries of at most 1 MiB each; previews expire with the authorized analysis and are cleared on shutdown. Images/archives use the existing server-owned `job-*` directories and cleanup on delivery, cancellation, failure, timeout, expiry and shutdown. Preserve active file delivery until the stream closes. Retention defaults remain analysis/job ten minutes, ready file sixty seconds, sweep every thirty seconds.

Before deployment, rerun `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`, `npx playwright test`, `npm run tools:check` and `git diff --check`. Use the install/startup and rollback commands above, after explicit deployment authorization. Verify an owner-authorized public photo post through real TLS/Nginx/PM2: previews, every individual image, selection reset, one-image delivery, ordered selected ZIP, verified MIME, cancellation, expiry, cleanup and rate/concurrency exhaustion. Recheck MP4 and MP3 with fully decoded files. Verify OS/process-tree egress policy before public launch; application-level pinning does not constrain yt-dlp's networking. Production access was not supplied and no deployment was performed.

## October 28 advertising, analytics and Cloudflare addendum

Use the current [audit](FINAL_SYSTEM_AUDIT_2026-10-28.md) and [advertising guide](ADVERTISING.md) alongside this historical runbook. Keep ADVERTISING_ENABLED, MONETAG_IPP_ENABLED, MONETAG_VIGNETTE_ENABLED and MONETAG_MOBILE_ENABLED false until official tags, verified origins, CMP callbacks and real-creative checks are complete. No private publisher code belongs in public/ or Git.

If local operational counters are enabled, use private OPERATIONS_DATA_DIR storage outside the release/web root, owned by the PM2 account. Back up operations.key and the SQLite database together. Quiesce the app before a filesystem copy and preserve SQLite sidecar files if present, or use a tested SQLite-consistent backup method. A copy of only an actively written main database file can omit WAL transactions. Verify restore in an isolated checkout before relying on a backup. Media jobs remain ephemeral across process restarts; the audit fixes stale ready counter records rather than promising download resumption.

The Nginx template now overwrites X-TikSave-Country with XX. Keep TRUST_COUNTRY_HEADER false until a reviewed trusted edge map replaces that fixed value. Never forward a visitor-provided geography label. GA4 country reports do not require this server header.

When Cloudflare proxying is enabled, verify Full (strict) TLS with a valid origin certificate and origin access restrictions. Per-visitor rate limiting also needs reviewed Nginx real-IP configuration: trust only current official Cloudflare ranges before accepting CF-Connecting-IP. Without it, remote_addr may be a Cloudflare edge address shared by many visitors. Do not use set_real_ip_from 0.0.0.0/0 or blindly trust arbitrary forwarded headers. The actual account settings/ranges/certificates were not accessed or changed here. Keep cache bypasses for APIs, streams, file delivery, ad bootstrap routes, readiness and errors; do not apply Cache Everything to them.

References: [Cloudflare headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/), [Full strict](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/), [Nginx real-IP module](https://nginx.org/en/docs/http/ngx_http_realip_module.html).
