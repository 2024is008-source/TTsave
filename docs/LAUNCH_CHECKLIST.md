# Production launch checklist

Current release inventory, final results and operator procedure:
[RELEASE_2026-10-28.md](RELEASE_2026-10-28.md). Treat older counts and unchecked
functional findings below as historical; Linux/VPS acceptance remains separate.
The owner confirms Cloudflare is not connected; its conditional historical
checks below are not active release gates. Verify direct Nginx/TLS hosting.

Current local implementation: [MP3, startup and private-admin fixes](BLOCKER_FIXES_2026-10-28.md), with [credential setup](ADMIN.md). Earlier unchecked functional items are historical until compared with that candidate's evidence. VPS/security/HTTPS/account verification and explicit deployment approval remain required.

Latest operator decision and live evidence: [Production blockers and controlled release/rollback](PRODUCTION_BLOCKERS_2026-10-28.md). Production is Express TTsave at `/var/www/TTsave`, commit `54d1122`; the separate Next app is not the target. Real MP4 delivery passed, real MP3 failed, and the now-required private dashboard is absent. Keep Monetag off. Do not treat the local dirty working tree as a deployed release.

Updated October 28, 2026. See [FINAL_SYSTEM_AUDIT_2026-10-28.md](FINAL_SYSTEM_AUDIT_2026-10-28.md) for the current local evidence and file list. **NOT READY FOR PRODUCTION until the unresolved deployment gates below are verified.** See [PRODUCTION_READINESS_2026-10-20.md](PRODUCTION_READINESS_2026-10-20.md), [DEPLOYMENT.md](DEPLOYMENT.md), and the earlier dated audit reports for historical evidence. The October 9 parking-page observation is no longer current: the October 20 public SEO snapshot reached the application and healthy redirects, but found release/configuration drift.

## Verified locally

- [x] Node.js 24.18.0 / npm 11.16.0; strict TypeScript, lint, unit/integration tests and production build pass. See the current report for final counts and browser results.
- [x] Production environment validation requires the canonical HTTPS origin and loopback bind; the PM2 template uses one fork process and loopback proxy trust.
- [x] URL/type/format validation, capability-protected file routes, bounded processing, cleanup, cancellation and timeout regression coverage.
- [x] In-flight analyses now abort and drain on service shutdown.
- [x] Public built-server smoke: homepage, all four articles, listing, five policy/contact pages, robots, sitemap, assets, `/ads.txt`, health/readiness and denied private-file access pass.
- [x] `ads.txt` now serves the existing declaration unchanged. No AdSense script was added and no publisher ID changed.
- [x] Local tools check reports yt-dlp, FFmpeg, FFprobe, Chrome impersonation target and libmp3lame available.
- [x] Owned synthetic MP4 probing/full decode, MP3 conversion/probing and bounded streaming checks pass; temporary fixtures removed.
- [x] Current npm advisory audit reports zero known vulnerabilities. This does not certify application security.
- [x] `.env`, `.env.local` and `.env.production` ignored; `.env.example` remains available. No real secret file was modified.
- [x] Optional GA4 retains canonical page locations, origin-only permitted referrers, one manual page view and no downloader-data hooks. Production consent/stream settings remain operator responsibilities.

## Required VPS and operational gates

- [ ] Record the intended release revision, PM2 cwd/script/environment and active Nginx upstream. Resolve the observed old live blog/robots/sitemap delivery before calling that release deployed.
- [ ] Install Node 24 and required system tools as the dedicated application user. Run `npm ci`, checks, build and `npm run tools:check` on Linux.
- [ ] Verify both DNS names, TLS chain, certificate renewal and HTTP/www redirects against the intended VPS. The prior read-only redirect snapshot passed; it does not verify renewal or current VPS configuration.
- [ ] Validate `nginx -t` before any authorized reload. Verify forwarded-header overwriting, per-client limiting, SSE, compression, file streaming and no caching of private responses.
- [ ] Verify one PM2 fork process, correct environment, startup/save, reboot recovery and graceful SIGTERM shutdown on Linux. Do not cluster the in-memory job service.
- [ ] Node must bind to 127.0.0.1; externally block port 3000 and restrict administrative access.
- [ ] **Security gate:** configure and test process-tree IPv4/IPv6 egress restrictions against private, loopback, link-local, reserved and metadata destinations, including child-process redirects and DNS changes. Node's pinned requests do not constrain yt-dlp networking. See DEPLOYMENT.md; do not install an unreviewed blanket firewall rule that could lock out administration or break required public traffic.
- [ ] Own the temporary root with the app user, mode 0700, outside the web root; verify cleanup and free-disk monitoring. Confirm filesystem quotas/capacity and resource limits on the actual VPS.
- [ ] Verify owner-authorized public TikTok MP4, MP3 and photo/selected-ZIP downloads through real TLS/Nginx/PM2; decode outputs and check MIME, filenames, selected format, expiry and cleanup. Local fixtures do not prove TikTok availability.
- [ ] Test cancellation, browser disconnects, timeout, rate/concurrency exhaustion, abrupt restart recovery and temp cleanup on the VPS.
- [ ] Confirm representative VPS CPU, memory and disk use supports the configured limits; perform no uncontrolled load tests.
- [ ] Review operator identity, monitored support/legal inbox, jurisdiction, legal drafts, provider arrangements and retention. Confirm any required consent before enabling Analytics; disable Enhanced Measurement in the actual GA4 stream and verify real collection payloads without artificial attribution.
- [ ] Confirm AdSense ownership/approval and crawlability of the unchanged declaration. Monetag orchestration is installed but disabled. No official Monetag tags or verified provider origins have been supplied. Its consent-manager bridge and real creatives must be verified before advertising is enabled.
- [ ] Verify public homepage metadata, all 11 sitemap entries, crawler assets, private noindex responses and the four article URLs after an authorized deployment. Search Console submission is manual and indexing is not guaranteed.
- [ ] Complete manual screen-reader, zoom, physical touch-device and broader-browser checks; automated Chrome/axe checks have limited scope.
- [ ] Configure PM2/Nginx log rotation and restricted access, short documented retention, encrypted configuration/release backups, restore verification and rollback.

Do not treat a passing build, mocked download test, prepared Nginx/PM2 template or historical live snapshot as evidence that these remaining gates have passed. No production restart or deployment was performed by this audit.

## October 28 audit additions

- [x] The supplied public photo post passed live local verification: 10 decoded images, an ordered selected ZIP, and zero remaining temporary files.
- [x] Advertising is default-off, format-specific, consent-gated and absent from private/delivery/error pages. See [ADVERTISING.md](ADVERTISING.md).
- [x] Native MP3 smoke output decoded fully using FFmpeg. This is offline media evidence, not a live TikTok MP3 result.
- [x] Local analytics filters and retained daily charts are consistent; ready records expire on process recovery without inventing delivery.
- [x] Nginx template overwrites visitor-provided country labels with XX. Trusted-country reporting remains opt-in and requires a reviewed source.
- [ ] Obtain and verify a real owner-approved video source for end-to-end MP4/MP3 through the deployed origin; the supplied source is a photo post.
- [ ] Verify the VPS's Nginx/TLS/Cloudflare/firewall/backup configuration. Historical remote observations are not current production evidence.
- [ ] If Cloudflare proxying is used, configure Nginx real-IP handling only for verified Cloudflare ranges before using CF-Connecting-IP; otherwise visitors can share an edge-IP rate-limit bucket. Keep the Node port private.

The separate Next.js preview at D:/My Project/Tiksave received the reported photo-representation and preview Back fixes. It is not the Express TTsave checkout; do not deploy one using the other's runbook.
