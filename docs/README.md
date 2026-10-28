# TTsave documentation index

The production application is Express/EJS/TypeScript TTsave at `/var/www/TTsave`,
PM2 `ttsave`, port 3000. Separate Next.js and SaveFrame previews are not release
inputs. A successful local build is not evidence of a deployed fix.

## Current operation and release gates

- [Newer homepage migrated into Express](HOMEPAGE_MIGRATION_2026-10-28.md): exact old/new source comparison, visual port and retained production integrations.
- [Generated test artifact cleanup](ARTIFACT_CLEANUP_2026-10-28.md): disposable output removal, protected documentation/assets and failure-only debug capture.

- [Reviewed release preparation](RELEASE_2026-10-28.md): current full-diff inventory,
  final checks, exact future Git commands, Linux staging and Contabo approval gates.

- [MP3, startup and private-admin implementation](BLOCKER_FIXES_2026-10-28.md): current local fixes, real media evidence, tests and safe release plan. Deployment/VPS verification remains separate.
- [Private admin setup](ADMIN.md): generated password hashes, sessions/CSRF, actual operational/GA4 reports and monitoring. No default account or advertising.

- [Baseline production review and rollback](PRODUCTION_BLOCKERS_2026-10-28.md): confirmed deployment identity and historical live failures. Use the implementation report for current local status; actual VPS verification remains separate.
- [Deployment](DEPLOYMENT.md) and [launch checklist](LAUNCH_CHECKLIST.md): Linux setup, private storage, process/proxy boundaries, egress policy, recovery and approval gates.
- [Analytics](ANALYTICS.md): GA4 consent/event contract, operational retention, optional Data API reporting, private dashboard integration and key/database backup.
- [Advertising](ADVERTISING.md): default-off Monetag formats, official private configuration, separate consent, exact CSP domains and activation checks.
- [Cleanup inventory and results](CLEANUP_2026-10-28.md): changes made to the existing dirty local working tree, retained uncertainties, before/after evidence and regression outcomes.

## Maintained architecture references

- [API contracts](API.md), [download jobs](DOWNLOAD_JOBS.md), [analysis](ANALYSIS.md), [URL validation](URL_VALIDATION.md) and [frontend states](DOWNLOADER_STATES.md).
- [MP3 processing](MP3_DOWNLOADS.md) and [photo/selected ZIP architecture](COMMAND17.md). The latter contains historical implementation evidence; use the current blocker report for release status.
- [Blog architecture](BLOG.md), [SEO setup](SEO_SETUP.md), [production SEO](PRODUCTION_SEO.md) and [image source requirements](IMAGE_REQUIREMENTS.md).
- [Original design](../reference/DESIGN.md): preserved reference. `reference/code.html` was removed by the owner previously; it is not a build dependency.

## Historical evidence retained

The dated audit reports, article approval records, migration notes, screenshots,
JSON measurements and live-verification snapshots document earlier work. They
are retained as evidence, not current release certification. Some historical
commands target old fixture versions or ports; use current package scripts and
the latest runbook. No old report can establish today's upstream availability,
production configuration, GA4 property settings or private dashboard readiness.

Generated browser output is development-only. `test-results/` is recreated by
Playwright; `docs/screenshots/browser-*/` contains historical captures and metrics.
Neither belongs in a production artifact. Private `.env`, publisher manifests,
service-account files, operations databases/keys and temporary media must remain
outside Git and release archives. Cleanup does not authorize deleting them.
