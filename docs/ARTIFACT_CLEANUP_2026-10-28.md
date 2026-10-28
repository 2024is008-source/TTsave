# Playwright artifact cleanup — October 28, 2026

Target: Express TTsave only. Removed 2,403 generated files (2,371,042,611 bytes,
approximately 2.21 GiB) across 25 generated output directories. This includes
repeated `docs/screenshots/browser-*` runs, advertising test captures and
`test-results/`. No existing HTML/blob report directory needed removal.

Confirmed 888 baseline-tracked generated screenshots were unnecessary repeated
test output. They were removed from the local workspace and Git index. **Only
these artifact deletions were staged**, as explicitly requested; preexisting
application changes remain uncommitted. No commit, push or history rewrite ran.
Previously committed images remain recoverable from Git history.

The historical run `docs/screenshots/browser-1792516067041/` (183 files) was
preserved because `PRODUCTION_READINESS_2026-10-20.md` intentionally references it.
It remains local/ignored and outside releases. Other maintained documentation
images and test fixtures were not targeted. No broad PNG/JPEG/WebP/media deletion
or ignore rule was used.

Before the later owner-requested homepage migration, hashes verified all 272
protected files under public/, src/, views/, tests/, reference/, deploy/, config/,
the environment and PM2 configuration unchanged by cleanup. Browser test source
was preserved. Subsequent visual migration changes are separately documented.

Ignore rules cover test-results/, playwright-report/, blob-report/, Playwright
cache/auth state and generated browser/advertising captures, while website
images, fixture assets and curated documentation screenshots remain eligible.

Playwright retains screenshots, video and traces only for failures. An isolated
deliberately failing test verified real PNG, WebM and trace.zip output using the
actual configuration; generated probe files are disposable and excluded. The
Playwright FFmpeg helper was installed in the local Playwright cache to support
video capture; no production runtime/tool configuration changed.

Cleanup validation passed lint, strict types, 466 unit tests, 206 integration
tests and build. Final release inventory/verification also includes the later
authorized visual migration; use its report for current functional test results.
