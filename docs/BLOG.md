# Blog infrastructure and publishing workflow

The production content registry contains the owner-supplied MP4, MP3, image-download and PC-download guides, marked published in the local application on October 20, 2026. See [FIRST_ARTICLE.md](FIRST_ARTICLE.md), [SECOND_ARTICLE.md](SECOND_ARTICLE.md), [THIRD_ARTICLE.md](THIRD_ARTICLE.md) and [FOURTH_ARTICLE.md](FOURTH_ARTICLE.md) for historical publication records. The owner subsequently requested MP4 → MP3 → Images as the featured order: these three appear in the homepage preview and first in the listing, followed by PC. See [BLOG_REFINEMENT.md](BLOG_REFINEMENT.md) for the cover and typography update. All four now have approved generated local covers. No verified author is configured, so no byline or author metadata is published. The empty state remains available when there are no published records. Indexing and rankings are not guaranteed.

## Architecture

- `src/data/blog-posts.ts` is the only production article registry. Import separate article modules from `src/data/blog/` here as the collection grows; no database or CMS is needed.
- `featuredBlogSlugs` in that file sets the editorial presentation order. Only published records can be featured. Unfeatured records follow newest first; when featured slugs are absent (including empty/draft fixtures), the existing newest-first fallback applies. Homepage preview remains limited to three. Publication timestamps and sitemap URL ordering remain unchanged; listing schema follows the displayed order.
- `src/services/blog.ts` defines the typed Zod model, validates the registry, filters drafts, sorts newest first, validates internal links and generates Blog/BlogPosting/BreadcrumbList data.
- `src/routes/public.ts` builds the public path registry, renders `/blog` and `/blog/:slug`, normalizes public URL aliases and generates the sitemap. `createApp` accepts a third optional content argument for isolated tests; production uses the real registry. No test content is loaded from requests or deployment environment settings.
- `views/blog.ejs`, `views/blog-article.ejs` and `views/partials/blog-*.ejs` render escaped content with shared head, header and footer. There is no Markdown parser or raw HTML field. Reuse paragraph, heading, list and validated internal-link blocks.
- `src/styles/_blog.scss` uses existing glass surfaces, typography, colors, spacing and theme tokens. It adds no motion; existing reduced-motion and focus styles remain effective.
- `src/check-blog.ts` runs at the end of every production build. It validates the production records and confirms each published cover's actual WebP format and dimensions with the existing Sharp dependency.

## Add a future article

When asked “Create a new SEO-friendly blog article about [TOPIC],” inspect this guide and current supported downloader behavior first. Write useful, original, reviewed content about that topic; do not rebuild the blog system or claim unsupported features.

1. Add a typed `BlogPost` record in `src/data/blog-posts.ts`, or create an article module under `src/data/blog/` and import it into that registry. Begin with `status: 'draft'`. All fields are validated on application startup, and complete content is required even for drafts. There is no public preview, admin endpoint or draft URL.
2. Choose a stable, unique lowercase ASCII slug using words separated by single hyphens, at most 100 characters. Do not include slashes, extensions, query parameters or percent encoding. The resulting URL is `/blog/<slug>`. Keep published slugs stable; a deliberate URL migration requires a separately reviewed redirect.
3. Supply a unique `seoTitle` (including the brand if desired), `description`, `title` (H1), concise `excerpt` and truthful `category`. Registry validation rejects duplicate published SEO titles/descriptions, including collisions with other public-page metadata. Do not alter the homepage title or description.
4. Optionally add an approved, topic-relevant WebP cover under `public/assets/images/blog/`. Use a lowercase hyphenated filename and a path such as `/assets/images/blog/<slug>.webp`. Supply meaningful `alt`, actual intrinsic `width` and `height`. A 1200 × 675 cover is a useful layout size; it is a recommendation, not an asserted image dimension. The card crops visually to 16:9; the article preserves the original aspect ratio. Cards load lazily; the article cover is prioritized. OG/Twitter tags and schema use this same local cover when supplied. A supplied cover must exist at startup and its format/dimensions must match at build time. When no suitable approved image exists, omit the entire `cover` field: cards and articles render without an image or empty placeholder, BlogPosting omits `image`, and OG/Twitter retain the existing local site branding card (JPEG, 1200 × 630). No editorial image or attribution is invented. Never hotlink images or reuse test imagery as editorial content.
5. Set `publishedAt` to the verified first publication timestamp in ISO 8601 with a timezone, for example the actual release time ending in `Z` or an explicit offset. Set `modifiedAt` only after a substantive verified update. Do not invent dates or automatically refresh them on builds. Future publication timestamps must stay drafts; publication is explicit, not scheduled. Display dates use UTC. A published modification cannot predate publication or be in the future.
6. Supply `author: { name }` only for an actual verified person who should be credited. Omit it if unknown. No publisher identity, ratings or other organization facts are inferred. The byline and structured data use the same record.
7. Compose `body` from these blocks:
   - `paragraph`: `content` is an array of `{ type: 'text', text }` or `{ type: 'link', text, href }` runs. Include intentional spaces in text runs surrounding a link.
   - `heading`: `level` is 2 or 3, with unique `id` and plain `text`. H3 follows an H2. Do not repeat the H1 or use reserved layout IDs (`main`, `mobile-nav`, `header-start-btn`, `analytics-init`).
   - `list`: `ordered` is boolean and `items` is an array of inline-run arrays.
     Raw HTML is escaped, never executed. Link targets must be existing public routes or published article URLs; fragment links must identify known headings. Homepage fragments include `/#how-it-works`, `/#features`, `/#faq` and `/#downloader`. No arbitrary URL, protocol, query string or external link is accepted by the article model. If future editorial needs require external citations, extend the validated model and security tests deliberately.
8. Optionally set `relatedSlugs` to up to three other published articles. Self-links, unknown articles, drafts and duplicate related entries are rejected for published posts.
9. Review accuracy, permissions, accessibility, metadata, source-dependent download availability and all internal links. Change `status` to `published` only when the content and real publication time are approved. Rebuild and restart through the normal authorized release workflow. The new record automatically becomes available in the listing, its article route and the sitemap. Homepage preview uses the first three in the featured presentation order described above. The preview is hidden when the registry has no published posts.

## Indexing and privacy behavior

Published listing/article pages return HTTP 200 with `index, follow` and a self-referencing canonical built from validated `PUBLIC_BASE_URL=https://tiksavemp4.online`. Unknown and draft URLs return real 404 responses with `noindex, nofollow, noarchive`; they contain no GA initializer. Drafts do not enter listing cards, related content, homepage previews, structured listing data or the sitemap. Draft source code is server-side, but a draft is not a confidential document store: do not commit secrets in content.

Queries never drive blog content. Query variants return the same readable page with `noindex, follow` and a clean canonical, and do not reflect parameter values. Known www, case, percent-encoded and trailing-slash public aliases redirect to the fixed canonical URL. All published posts have normal crawlable HTML links in the listing and remain readable without JavaScript. No pagination hides older articles.

`sitemap.xml` now includes `/blog` plus every published record automatically. It excludes drafts and unknown routes and does not invent last-modified dates. Existing `robots.txt` already allows public pages and `/assets/` while blocking private API/download paths; those protections stay unchanged. Empty listings use only truthful Blog and visible breadcrumb data. Article schema and visible breadcrumbs use the same records; unknown authors and modified dates are omitted.

Blog pages load the shared theme/navigation module, with no downloader module. Optional GA4 uses the existing public-page CSP and origin-only attribution policy; its canonical-location allowlist now includes blog paths. No source, medium, session, cookie or referrer sanitization behavior changes. Private endpoints retain their existing policies. AdSense files and legal content are unchanged.

## Verify and run locally

### Implementation file manifest

Created:

- Content/model/build validation: `src/data/blog-posts.ts`, `src/services/blog.ts`, `src/check-blog.ts`.
- Templates: `views/blog.ejs`, `views/blog-article.ejs`, `views/partials/blog-card.ejs`, `views/partials/blog-inline.ejs`, `views/partials/blog-preview.ejs`.
- Styling: `src/styles/_blog.scss`.
- Tests/fixtures: `tests/blog.test.ts`, `tests/e2e/blog.test.ts`, `tests/browser/blog.spec.ts`, `tests/fixtures/blog.ts`.
- Workflow and operations: `docs/BLOG.md`.

Modified for this phase:

- `src/app.ts`, `src/routes/public.ts`: validated registry injection, public blog rendering, canonical aliases and sitemap inclusion.
- `views/index.ejs`, `views/partials/header.ejs`, `views/partials/footer.ejs`: conditional preview and crawlable navigation links.
- `views/partials/head.ejs`: article-specific social metadata with unchanged defaults for existing pages; stylesheet/initializer cache versions.
- `src/styles/app.scss`, generated `public/assets/app.css`: local blog stylesheet.
- `public/assets/js/analytics.js`: allow canonical public blog paths; origin-only attribution logic is unchanged.
- `package.json`: verify published blog images after compiling the production build; no dependency changes.
- `tests/analytics.test.ts`, `tests/e2e/analytics.test.ts`, `tests/browser/analytics.spec.ts`, `tests/e2e/seo.test.ts`: blog metadata, attribution, sitemap and initializer-version regressions.
- `tests/browser/downloader.spec.ts`: wait for the existing application bootstrap before replacing its adapter with a fixture; preserves every downloader assertion and removes an initialization race exposed by the regression run.

No downloader source/API, homepage title/description, legal content, AdSense files or deployment configuration is modified by this phase.

Use Node.js 24 LTS. Install the existing lockfile with `npm ci` when setting up a fresh checkout. Run `npm run check` (lint, typecheck, unit tests, integration tests and production build), then `npm run test:ui -- tests/browser/blog.spec.ts tests/browser/seo.spec.ts tests/browser/analytics.spec.ts`. Fixtures live only under `tests/`; do not copy them into the production registry.

Start development with `npm run dev` plus `npm run css:watch` when editing styles. Alternatively run `npm run build` then `npm start`. Open `/blog` on the configured local port (default from `.env.example`). Public canonical URLs intentionally remain production URLs during local testing. Browser tests exercise the approved production records and separate local fixture servers; no fixture article is published to the real app. Isolated empty-registry integration tests retain empty-state coverage.

For each approved future article, inspect the HTTP status, canonical, robots directives, title/description, OG image, rendered H1/H2/H3, JSON-LD and all links without JavaScript. Inspect `/sitemap.xml` and `/robots.txt`; test a draft/unknown URL and a query duplicate. Test mobile and desktop in both themes and check for overflow and console errors. Confirm no downloader bundle is requested on blog pages and that the homepage/download flows still work.

## Authorized VPS release and manual checks

No release is performed by this task. Follow `DEPLOYMENT.md` for an owner-approved release, including backup/rollback. With Node 24 and the intended release checked out on the VPS: run `npm ci`, `npm run check`, then use `pm2 startOrReload ecosystem.config.cjs --env production --update-env` from the deployed project directory. Preserve `.env`, `PUBLIC_BASE_URL`, GA ID, Nginx TLS/security settings, credentials and downloader tool configuration. Confirm the existing PM2 app is online and `/health`, `/ready`, `/blog` and `/sitemap.xml` respond correctly. No new Nginx route or public draft/static content directory is required; Express serves the blog.

After the owner-authorized release, verify real DNS/TLS, redirects, mobile rendering, caching, local image delivery, no private indexing and correct GA collection parameters. Inspect published URLs with Search Console URL Inspection and validate article markup with Google's Rich Results Test; an empty listing is not a fabricated article. Submit the updated sitemap through the verified Search Console property if appropriate. These are manual owner steps, not automatic indexing or ranking guarantees. Local tests cannot establish production accessibility, Google indexing or search performance.

## Historical infrastructure verification — October 20, 2026

- `npm run check` passed lint, strict typechecking, 402 unit tests across 21 files, 153 integration tests across 12 files, and the production build. The build validated zero published production records and covers, as intended.
- The final relevant Chrome run passed all 54 tests across blog, SEO, analytics, legal layouts, download API handoff, keyboard/cancellation/progress, MP3, individual/repeated photos, selected-photo ZIPs and responsive UI suites. Blog listing checks include 390, 768, 850, 1024 and 1440 pixels; broader homepage checks also include 1920 pixels. Blog accessibility checks cover both themes, reduced motion, and article reading without JavaScript. Desktop/mobile listing and dark article fixture screenshots were visually inspected.
- Initial failures were investigated: the article contrast scan now waits for the existing header theme transition to settle; the downloader fixture now awaits the conditional application bootstrap before replacing its adapter. No tests or assertions were removed or skipped, and downloader implementation was not changed.
- `git diff --check` passed. No articles were published, no new dependencies installed, and no commit, push, deployment or external account changes were performed. Test-only articles and intercepted Google collection remain local fixtures.

References: [Google Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article), [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
