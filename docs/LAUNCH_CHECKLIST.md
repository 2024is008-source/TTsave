# Launch checklist

October 9, 2026. **NOT READY FOR LAUNCH.** Check only verified items; a prepared config is not a passed deployment. See PRODUCTION_AUDIT.md and DEPLOYMENT.md. Public DNS currently serves Namecheap forwarding/parking, apex HTTPS times out and www TLS fails. No VPS SSH access or authorized live test video has been provided.

## Automated local checks

- [x] Final lint, strict typecheck, 198 unit tests, 91 route tests, 39 browser tests and production build pass.
- [x] Environment validation: sole canonical HTTPS origin, loopback production bind, TRUST_PROXY=1, explicit executable paths.
- [x] Unit/route coverage for URL/type/format allowlists, filename safety, process timeout/cancel, cleanup, concurrency, content types and authorization.
- [x] Node thumbnail private-network/redirect rejection tests. Child-process egress containment remains a separate production gate.
- [x] Safe error/log categories, capped request body, creation rate limiter, cancellation unaffected by creation budget.
- [x] Offline MP3 conversion, codec verification and full decode of owned synthetic audio.
- [x] Local homepage liveness/SEO/robots/sitemap/legal routes/custom 404 checks; no API/result URLs in sitemap.
- [x] Final six-viewport light/dark matrix: 60 full-page screenshots, keyboard radio behavior, no horizontal/internal panel overflow, automated WCAG checks and standalone 44px controls.
- [x] All 60 final screenshots visually inspected through full-page contact sheets.
- [x] Local streaming/CPU/disk/concurrency measurements saved; cleanup verified. These do not establish VPS capacity.
- [x] No analytics or advertising scripts added; no cookies/signed URLs/real media included in public evidence.
- [x] Real `.env` ignored; no Docker files or automatic commit.

## Manual and production gates — all still require verification

- [ ] DNS: apex and www resolve to intended VPS; remove Namecheap forwarding/parking; validate any AAAA route.
- [ ] HTTPS: trusted valid certificate for both names, correct chain and renewal test.
- [ ] Canonical redirects: HTTP apex, HTTP www and HTTPS www lead to HTTPS apex; no loops.
- [ ] VPS revision recorded; clean/reviewed working tree; Node 24; `npm ci`, checks and build succeed there.
- [ ] PM2: one healthy `ttsave` fork instance, correct cwd/environment, startup/save and reboot verification.
- [ ] Nginx syntax passes on VPS; reload only after successful `nginx -t`; SSE/media streaming and compression verified.
- [ ] Firewall: Nginx only public HTTP entry; external port 3000 inaccessible; Node bound to 127.0.0.1.
- [ ] Child-process egress policy tested against IPv4/IPv6 private/loopback/link-local and redirect/DNS-change destinations.
- [ ] Internal and public `/health` and `/ready` return HTTP 200; tool/MP3 capability confirmed.
- [ ] Owner-authorized live TikTok analysis and real thumbnail work; invalid/private/deleted/unavailable links fail safely.
- [ ] Live MP4 quality selection, download, full decode, MIME/filename and cleanup pass through Nginx.
- [ ] Live MP3 selection/conversion, download, full decode, MIME/filename and cleanup pass through Nginx.
- [ ] Cancellation, expired capabilities, interrupted clients, timeouts, restart recovery and temp cleanup verified on VPS.
- [ ] Representative VPS CPU/memory/disk/load measurements support configured concurrency/limits; monitor free disk.
- [ ] Manual keyboard/focus, mobile menu, screen reader announcements, zoom and touch-device checks complete. Automated axe checks cover only detectable issues.
- [ ] Actual mobile device and broader browser sanity checks completed.
- [ ] Production SEO metadata, robots, sitemap, noindex behavior, social image and custom 404 verified publicly.
- [ ] Google Search Console ownership/sitemap submitted; inspect canonical/indexing after availability.
- [ ] Bing Webmaster Tools ownership/sitemap submitted.
- [ ] Analytics privacy reviewed: none configured currently; server log access/retention minimized.
- [ ] Legal pages approved by operator; a real monitored support/legal inbox configured; non-affiliation/copyright notices correct.
- [ ] PM2/Nginx log rotation and retention/access policy configured; no signed URLs/cookies in captured logs.
- [ ] Encrypted configuration/release backups and restore test pass; temporary media excluded.
- [ ] Rollback release/config available and recovery procedure tested.

Recommendation: hold launch until every production gate has evidence. Do not mark live download, PM2, Nginx, TLS or firewall checks as passed from local mocks.
