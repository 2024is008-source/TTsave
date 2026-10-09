# Ubuntu deployment and recovery

Prepared October 9, 2026. This is a runbook, not evidence of deployment. Local tests run on Windows; Ubuntu, PM2 and Nginx have not been accessed. Do not launch until every production gate in LAUNCH_CHECKLIST.md is verified.

## Environment and ownership

Use Node.js 24 LTS and one dedicated unprivileged application user. Checkout path: `/var/www/TTsave`. Keep `.env` outside Git, owned by that user, mode 0600. Begin with `.env.example`, then set:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
PUBLIC_BASE_URL=https://tiksavemp4.online
TRUST_PROXY=1
LOG_LEVEL=info
YT_DLP_PATH=/usr/local/bin/yt-dlp
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
DOWNLOAD_TEMP_ROOT=/var/lib/ttsave/tmp
```

Executable paths are examples: verify their actual installation paths, executability and versions on the VPS. `YT_DLP_PATH` supports the legacy `YTDLP_PATH` alias; conflicting settings fail. Set a real monitored PUBLIC_CONTACT_EMAIL or LEGAL_CONTACT_EMAIL. Never put credentials, cookies or signed URLs into this file or audit evidence. Create the temporary root owned by the application user, mode 0700, outside the checkout; never use a shared root or web-served directory.

Retain the example's duration, byte, TTL, timeout and concurrency limits until a representative VPS load test supports a change. Two downloads/conversions and four application operations are the defaults. MP3 requires libmp3lame and ffprobe. Run `npm run tools:check` after configuring paths; verify MP3 capability separately from liveness. Tools must be current, but upgrades need a smoke test.

## Network security prerequisite

Node thumbnail requests validate every redirect, pin public DNS answers and enforce byte/time limits. yt-dlp runs in a child process and performs its own DNS and media redirects. URL allowlists alone cannot contain child-process SSRF. Before public access, configure and test OS/network egress restrictions for the application user/process tree: block private, loopback, link-local, multicast, reserved and metadata destinations in IPv4 and IPv6, including redirects and DNS changes. Allow the public destinations/protocols actually needed by supported TikTok extraction. Validate this policy with a controlled endpoint you own; never probe third-party internal systems. This repository does not install an egress policy, so this remains a launch blocker.

Expose only Nginx on 80/443, plus administratively restricted SSH. Verify external TCP 3000 is unreachable and `ss -ltnp` shows Node listening only on 127.0.0.1:3000. One local Nginx overwrites forwarded headers; Express trusts only loopback peers. If adding another proxy, reassess this trust boundary.

## DNS, certificates and Nginx

Current public evidence shows Namecheap forwarding/parking, not this application. Replace forwarding/parking with apex A (and AAAA only if IPv6 is configured) records to the actual VPS; point www to that deployment. Obtain and validate a certificate covering BOTH names before enabling the HTTPS blocks in `deploy/nginx/ttsave.conf`. For initial HTTP ACME issuance, enable only its port 80 server with the challenge webroot; do not enable certificate paths that do not exist. Verify renewal and perform a renewal dry run.

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

Configure PM2 and Nginx log rotation, restrictive log access and a documented short retention period. Nginx access logs deliberately omit URLs, queries and headers; IPs remain necessary security data. Critical Nginx error records may still include request context, so restrict access and never export raw logs as public evidence. Application logs use fixed route labels and sanitized error categories. No analytics/ad scripts were added; adding tracking needs a separate privacy review.

Monitor health/readiness failures, process restarts, queue rejection, disk free space, stale temporary files and TLS expiry. `/health` is liveness, not proof TikTok is reachable. Test resource behavior on the actual VPS with approved sources; local CPU/RSS numbers are not sizing guarantees. Temporary media must never be backed up or served statically.

Back up the exact release revision, package lock, reviewed Nginx/PM2 config and encrypted environment separately. Test restoration without exposing secrets; include contact/legal content, exclude temporary media. Keep a previous built release and known-good configuration. Rollback: stop accepting work, let/cancel active jobs, restore the known-good release/config (preserving `.env`), run `npm ci` and `npm run build`, then restart the one PM2 process. Validate health/readiness and downloads. For Nginx rollback, restore its reviewed config and run `nginx -t` before any reload. Record the deployed revision and rollback result.

Configuration references: [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/), [PM2 ecosystem fields](https://pm2.keymetrics.io/docs/usage/application-declaration/), [Nginx proxy buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).
