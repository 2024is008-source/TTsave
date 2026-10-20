# Technical SEO, sitemap and indexing audit

Domain: `https://tiksavemp4.online`. Live public snapshots: October 20, 2026, approximately 21:36–21:40 Asia/Colombo (16:06–16:10 UTC). Evidence: [SEO_LIVE_EVIDENCE_2026-10-20.json](SEO_LIVE_EVIDENCE_2026-10-20.json). Local checks use the current repository; live checks use unauthenticated public GET requests with normal TLS verification. No SSH, active Nginx/PM2 configuration or authenticated Search Console access was available. No production change, commit, push, restart, reload or deployment was performed.

## Findings and actual root causes

1. **Confirmed delivery mismatch:** the repository has four published articles, their routes, navigation and an automatic 11-URL sitemap. Production returns 404 for `/blog` and all four articles and serves a six-URL sitemap. Its homepage title/description and versioned asset names also differ from this checkout. Production is therefore not delivering the current repository's public implementation. An older release, a different PM2 checkout/upstream, or Nginx/static overrides are possible explanations; identifying the exact component requires VPS inspection. Do not claim a specific deployed Git revision from public HTTP alone.
2. **Confirmed live robots defect:** live `Disallow: /*?*` blocks query-string resources, including the observed `/assets/app.css?v=photo-selection-6` and `/assets/js/app.js?v=photo-selection-6`. Both resources return HTTP 200 when fetched directly, but compliant crawlers are instructed not to fetch them. Current repository robots already removes this blanket restriction and explicitly allows `/assets/`. Google documents wildcard/path matching and the importance of allowing rendering resources in its [robots specification](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec).
3. **No confirmed technical indexing defect on the five legal/contact pages:** all returned 200 without authentication, with useful SSR content, one correct canonical, `index, follow`, no conflicting X-Robots-Tag and links from the live homepage/footer. Their titles and descriptions are unique. The broad resource block is sitewide, but this audit cannot prove it caused their particular Search Console status. Google's [Page indexing report guidance](https://support.google.com/webmasters/answer/7440203) distinguishes discovery/crawl scheduling from application errors and does not promise indexing of every page.
4. **Expected redirects are healthy:** all three reported hostname/scheme variants returned a direct permanent 301 to HTTPS apex. The canonical target returned 200. Do not remove correct redirects to suppress an expected Search Console classification.

Initial sandbox DNS requests failed; authorized network checks subsequently resolved both hosts and retrieved the site successfully. The sandbox errors are not evidence of a production DNS outage. Both hosts resolved to IPv4 `13.140.157.97` in this snapshot; this is an observation, not a recommendation to change DNS.

## Sitemap before and after; target HTTP status

The **repository sitemap before this audit already had all 11 URLs**, based on source inspection. The **executed local sitemap after this audit has the same 11 URLs**, without a generator change. The **observed live sitemap still has six URLs**; no live change was authorized. The table lists every location, not an alternative URL list for the application to maintain.

| Canonical URL                                                      | Repository sitemap before / after | Local GET | Live sitemap | Live GET |
| ------------------------------------------------------------------ | --------------------------------- | --------- | ------------ | -------- |
| https://tiksavemp4.online/                                         | Included / included               | 200       | Included     | 200      |
| https://tiksavemp4.online/privacy                                  | Included / included               | 200       | Included     | 200      |
| https://tiksavemp4.online/terms                                    | Included / included               | 200       | Included     | 200      |
| https://tiksavemp4.online/responsible-use                          | Included / included               | 200       | Included     | 200      |
| https://tiksavemp4.online/copyright                                | Included / included               | 200       | Included     | 200      |
| https://tiksavemp4.online/contact                                  | Included / included               | 200       | Included     | 200      |
| https://tiksavemp4.online/blog                                     | Included / included               | 200       | Absent       | 404      |
| https://tiksavemp4.online/blog/how-to-download-tiktok-videos-on-pc | Included / included               | 200       | Absent       | 404      |
| https://tiksavemp4.online/blog/how-to-download-tiktok-images       | Included / included               | 200       | Absent       | 404      |
| https://tiksavemp4.online/blog/how-to-convert-tiktok-to-mp3        | Included / included               | 200       | Absent       | 404      |
| https://tiksavemp4.online/blog/how-to-convert-tiktok-to-mp4        | Included / included               | 200       | Absent       | 404      |

Both local and live sitemaps return 200 with `application/xml; charset=utf-8`, valid XML and the sitemap namespace `http://www.sitemaps.org/schemas/sitemap/0.9`. All locations are unique HTTPS apex URLs. There are no `lastmod`, `priority` or `changefreq` values. Unknown content-change dates were not invented. Local tests visit every location and verify 200, self-canonical, index/follow, HTML content type and no redirect/noindex header. Drafts, query variants, aliases, API operations, health/readiness, assets and temporary download links are excluded. An isolated newly published fixture enters the sitemap automatically; it is not a production article. See [Google's sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

Do not add these five missing blog URLs to a separate live static sitemap while they still return 404. Release the matching public routes and dynamic generator together.

## Published article registry and structured data

All four records exist in `src/data/blog-posts.ts` and have `status: 'published'`:

| Article slug                        | Recorded local publication timestamp (UTC) | Local / live         |
| ----------------------------------- | ------------------------------------------ | -------------------- |
| how-to-convert-tiktok-to-mp4        | 2026-10-20T12:48:57.092Z                   | Published, 200 / 404 |
| how-to-convert-tiktok-to-mp3        | 2026-10-20T14:35:51.169Z                   | Published, 200 / 404 |
| how-to-download-tiktok-images       | 2026-10-20T15:09:44.987Z                   | Published, 200 / 404 |
| how-to-download-tiktok-videos-on-pc | 2026-10-20T15:26:24.954Z                   | Published, 200 / 404 |

Local JSON-LD parses successfully and supplies BlogPosting headline, description, self URL/mainEntityOfPage, the record's datePublished, its actual local cover and matching BreadcrumbList. Visible H1/breadcrumbs match the records. No author is configured, so none is fabricated; unknown dateModified is omitted. Existing serialization tests cover script-closing characters and XML escaping.

The recorded dates describe the approved local publication workflow; public first availability has not been verified because production routes are missing. Before the initial live release, the owner should confirm that publication dates correctly represent actual publication and make any necessary adjustment using the verified release event. Do not automatically refresh dates on build, request or deployment. No article date, author, image or prose was changed by this audit. Live blog structured data cannot be validated on missing pages; their 404/noindex responses are appropriate until the routes exist.

## robots.txt and query behavior

Observed live robots contains the broad `Disallow: /*?*` rule and no explicit asset allow. The current source already emits the intended replacement:

```text
User-agent: *
Allow: /
Allow: /assets/
Disallow: /api/
Disallow: /analyze
Disallow: /health
Disallow: /ready
Sitemap: https://tiksavemp4.online/sitemap.xml
```

This source was retained. Existing matcher tests exercise actual CSS, JavaScript imports, images, favicon, representative font URLs, blog/legal pages and private endpoints. Versioned assets remain crawlable. Public query variants are deliberately crawlable but nonindexable, so a crawler can read their clean canonical and noindex signal. Live `/?seo_audit=1` and `/privacy?seo_audit=1` already return 200 with `noindex, follow` in both meta/header and the clean canonical; their current robots block prevents compliant crawlers from observing those signals. See [Google's noindex instructions](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

Robots is not access control. Existing authorization/capability checks, expiry, private no-store/noindex headers and private-route exclusions remain intact. No private endpoint was added to the sitemap or made public.

## Canonicals, headers and redirects

- Locally, every intended public page has exactly one absolute self-canonical built from validated `PUBLIC_BASE_URL`. The generator never uses an arbitrary Host/forwarding value for a public URL. All 11 indexable pages have unique titles/descriptions, one H1 and useful SSR HTML.
- The six live HTML pages returning 200 have correct self-canonicals, unique metadata, index/follow and no X-Robots-Tag. Live blog 404 pages have no canonical and `noindex, nofollow, noarchive`, rather than pretending to be homepage duplicates.
- Live homepage metadata is an additional release mismatch: its title is `TikTok Downloader – Download MP4, MP3 & Photos | TikSaveMP4`, while the repository's requested title remains `TikTok to MP4, MP3 & Image Downloader | TikSaveMP4`. The live description also differs. No homepage metadata was edited to reconcile this audit; confirm the approved release before deployment.
- `http://tiksavemp4.online/`, `http://www.tiksavemp4.online/` and `https://www.tiksavemp4.online/` each returned 301 directly to `https://tiksavemp4.online/`, which returned 200. The same three variants of `/privacy` each redirect directly to its 200 canonical. No chain or loop was observed in these six live entry checks. This is not an exhaustive probe of every malformed URL.
- The repository Nginx template uses 308 for these fixed-origin redirects; 301 and 308 are both permanent. There is no reason to change a healthy live 301 to 308 just for this report. Local application tests verify one redirect for every canonical public path under each scheme/hostname variant, followed by 200 behind trusted loopback TLS termination.
- Private/error responses retain noindex/no-store; public query variants retain noindex/follow and clean canonicals. Security headers, CSP and proxy-trust boundaries were not weakened.

## Internal discovery

Local header/footer link to `/blog`, and the complete SSR listing links to all four articles. Each article links to the homepage, with contextual MP4/MP3 links and related articles where configured. Legal/contact links are in the footer. No downloader bundle is needed to read a blog article. Existing body-text tests remain passing.

The homepage intentionally preserves the owner's recent MP4 → MP3 → Images featured selection, rather than changing it back to chronological PC → Images → MP3 during an SEO audit. All three preview links are published and crawlable; PC remains linked in the complete listing. This differs from the checklist's generic “latest three” wording but does not prevent discovery of any published article. No extra sitewide links or keyword stuffing were added.

Live homepage links contain the legal/contact pages but do not expose the current blog navigation. Releasing the current SSR templates restores the already-implemented blog discovery path; no additional local link changes were necessary.

## Source locations inspected

- `src/routes/public.ts:43`: published registry and editorial display order; `:54` builds public blog metadata; `:74` derives sitemap paths from the same page collection; `:101` uses fixed-origin redirects; `:115` and `:175` handle query noindex; `:220` emits robots; `:238` emits escaped dynamic XML.
- `src/services/blog.ts:143`: validates/filter/sorts records; `:157` validates covers and internal targets; `:226` and `:255` generate BlogPosting/BreadcrumbList.
- `src/config/env.ts`: strict production-origin validation. `src/app.ts:66`: loopback-only proxy trust; `:101`: private noindex/no-store; `:110`: local assets served before the application request budget. Existing security/rate limits were retained.
- `views/partials/head.ejs:5` and `:6`: one robots meta and one canonical; `:37`: inert serialized JSON-LD. Blog templates and footer emit real HTML anchors.
- `deploy/nginx/ttsave.conf:17` and `:30`: canonical redirects; `:51`: loopback upstream; `:55`: trusted forwarded scheme; `:64`: proxy cache disabled in the template. Its presence does not prove the same configuration is active on the VPS.

## Changes made in this audit

Created `tests/e2e/seo-audit.test.ts` with four comprehensive invariants: exact published sitemap coverage plus live local page checks; automatic future-publication discovery/draft exclusion; complete SSR internal-link/schema checks; and every public path's canonical redirect/TLS-termination behavior.

Created this report and `docs/SEO_LIVE_EVIDENCE_2026-10-20.json`. Updated the stale parking/DNS paragraph in `docs/DEPLOYMENT.md` to reflect current measured delivery and avoid unnecessary DNS changes. The temporary read-only HTTP probe was removed after recording public evidence.

No application runtime, robots generator, sitemap generator, Nginx template, article, UI, downloader, GA4 or AdSense changes were needed in this checkout. The requested runtime fixes already exist here; duplicating them would not repair the different deployment being served publicly.

## Manual VPS review and release

1. Identify the intended checkout/release and PM2 working directory/script with `pm2 describe ttsave`. Inspect active Nginx with `sudo nginx -T` locally; do not publish raw environment/configuration output. Look for another upstream, duplicate server block, exact-match static `/robots.txt` or `/sitemap.xml` locations, or edge caching. Determine why the response differs from this checkout.
2. Compare `curl -i http://127.0.0.1:3000/robots.txt` with `curl -i https://tiksavemp4.online/robots.txt` on the VPS. If both are old, inspect the running build/checkout; if only the edge is old, inspect Nginx/static/cache overrides. Inspect the loopback sitemap and blog routes too. Do not weaken security headers or replace working DNS/redirects.
3. Prepare an owner-approved release containing the current article records, templates, built assets and dynamic public router. These workspace changes are uncommitted; a bare `git pull` is not proof they reached the VPS. Preserve production `.env` and tool/security configuration. Run `npm ci`, `npm run check` and normal production readiness/download checks using the existing deployment runbook. Confirm `PUBLIC_BASE_URL=https://tiksavemp4.online` and the documented loopback proxy trust setup.
4. Only with separate owner deployment authorization, activate the reviewed release through the existing PM2 workflow. A restart affects in-memory jobs; plan the release accordingly. No restart was executed in this audit.
5. **No unconditional Nginx edit is recommended:** measured redirects are already correct. If active-config inspection finds stale static crawler-file locations or a wrong upstream, reconcile those specific overrides with the existing reviewed template. Validate any actual edit with `sudo nginx -t` before an owner-authorized reload. Do not install a second conflicting redirect layer or reload an untested configuration.
6. Re-fetch all 11 canonical pages, robots, sitemap, representative versioned resources and the three redirect roots through real public TLS. Require 200 for blog routes before claiming production publication. Expect 11 unique XML locations and no blanket query block. If an external cache is actually present, invalidate only the stale public responses through the owner-approved process.

## Manual Search Console actions and limits

After public delivery is correct, use the verified `https://tiksavemp4.online/` property to submit/recheck `/sitemap.xml`. URL Inspection → Test live URL should confirm fetch/robots/canonical/content for the homepage, blog listing and important guides before requesting indexing. Validate article markup using Google's Rich Results Test after URLs return 200.

Leave expected alternate-host redirect reports alone. For the five legal/contact pages, inspect the recorded last crawl, Google's selected canonical and Crawl Stats/server availability; request indexing only when appropriate. Do not manufacture extra content or repeatedly submit low-value legal pages merely to obtain full coverage. Google decides crawl and indexing; these code checks cannot guarantee either.

This audit cannot read the property's actual Page indexing reports, Google-selected canonicals, Crawl Stats, last crawl/rendered screenshots, robots cache, penalties or active server logs/configuration. A public GET is a snapshot from this network, not proof Googlebot received the same response. Browser fixtures do not establish real GA collection, AdSense serving or upstream TikTok availability. None of those were changed.

## Validation results

- `npm run check`: ESLint, strict typechecking, all 403 unit tests and all 171 integration tests passed, followed by the production build. Four published records and four cover images were validated.
- Relevant Chrome run: all 46 tests passed (2.2 minutes), covering SEO, all four articles, blog navigation/discovery without JavaScript, legal layouts, light/dark accessibility and analytics attribution. Command: `npm run test:ui -- tests/browser/seo.spec.ts tests/browser/blog.spec.ts tests/browser/first-blog-article.spec.ts tests/browser/second-blog-article.spec.ts tests/browser/third-blog-article.spec.ts tests/browser/fourth-blog-article.spec.ts tests/browser/legal.spec.ts tests/browser/analytics.spec.ts --timeout=60000`.
- Existing robots tests match actual versioned resources, public query duplicates and private paths, and detect the original broad-query-block regression. Existing XML-escaping and structured-data serialization tests passed. No test was removed or skipped.
- Live status, redirect, metadata, sitemap, robots, query and asset observations are retained in the evidence JSON, clearly separate from local checks. No production fix is claimed by these local passes.
