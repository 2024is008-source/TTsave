# Production launch checklist

Updated October 20, 2026. **NOT READY FOR PRODUCTION until the unresolved deployment gates below are verified.** See [PRODUCTION_READINESS_2026-10-20.md](PRODUCTION_READINESS_2026-10-20.md), [DEPLOYMENT.md](DEPLOYMENT.md), and the earlier dated audit reports for historical evidence. The October 9 parking-page observation is no longer current: the October 20 public SEO snapshot reached the application and healthy redirects, but found release/configuration drift.

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
- [ ] Confirm AdSense ownership/approval and crawlability of the unchanged declaration. No ad-serving script is currently installed by this application.
- [ ] Verify public homepage metadata, all 11 sitemap entries, crawler assets, private noindex responses and the four article URLs after an authorized deployment. Search Console submission is manual and indexing is not guaranteed.
- [ ] Complete manual screen-reader, zoom, physical touch-device and broader-browser checks; automated Chrome/axe checks have limited scope.
- [ ] Configure PM2/Nginx log rotation and restricted access, short documented retention, encrypted configuration/release backups, restore verification and rollback.

Do not treat a passing build, mocked download test, prepared Nginx/PM2 template or historical live snapshot as evidence that these remaining gates have passed. No production restart or deployment was performed by this audit.
