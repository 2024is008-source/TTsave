# Production SEO, legal pages and responsible use

Historical Command 11 record. The October 9 USA SEO changes, current metadata/schema, sitemap and verification are documented in [SEO_RESULTS.md](SEO_RESULTS.md), with owner setup in [SEO_SETUP.md](SEO_SETUP.md) and outreach in [OFFSITE_SEO.md](OFFSITE_SEO.md). Those current results supersede the earlier metadata and five-URL sitemap descriptions below.

## Canonical configuration

The permanent public origin is `https://tiksavemp4.online`. Zod validates and normalizes `PUBLIC_BASE_URL` without a trailing slash. Production startup requires it explicitly; missing values, HTTP, alternate hosts, credentials, ports, paths, queries and fragments fail validation. Development and tests default to the canonical production origin, avoiding local metadata. Host and forwarding headers never generate public metadata.

Set `PUBLIC_CONTACT_EMAIL=tiksavemp4@gmail.com` and `LEGAL_CONTACT_EMAIL=tiksavemp4@gmail.com` in the production environment. The legal setting takes precedence over the public setting. Both are validated email addresses; the public setting defaults to the supplied official address when absent. Existing explicit environment values continue to override this fallback, so update both VPS variables and run `pm2 restart ttsave --update-env` after deployment.

## Pages and metadata

Public routes: `/`, `/privacy`, `/terms`, `/responsible-use`, `/copyright`, `/contact`, `/robots.txt`, `/sitemap.xml`. All content is server-rendered with the shared header, footer and head partial. Each page has a unique title and description, canonical URL, English language declaration, Open Graph metadata and page-specific Twitter card metadata. Homepage copy matches Command 11 exactly. Legal pages have a dated draft note and readable 820px content width, 16–18px body text, 24px section headings and responsive titles.

The homepage includes factual `WebApplication` JSON-LD using the configured origin. It is an inert `application/ld+json` data block, not inline application JavaScript. Server-owned data is serialized with HTML delimiters and Unicode separators escaped. No ratings, reviews, offers, prices, download totals, organizational claims or FAQ schema are added. Helmet/CSP directives remain unchanged, including `script-src 'self'`.

The local social image is `/assets/og/tiksavemp4-social-card.jpg`, a 1200×630 optimized JPEG built from original repository SVG artwork. It contains brand text and supported-public-link/source-format language, no photographs, TikTok interface, usage counts or unsupported promises. The same source also generates the existing WebP image variants.

The sitemap XML-escapes generated URLs and contains exactly the five specified canonical pages: Home, Privacy, Terms, Responsible Use and Copyright. Contact remains a normal indexable public page with its own canonical metadata but is intentionally omitted from the sitemap. The sitemap invents no `lastmod` dates or language alternatives. Robots permits rendering assets and excludes actual API, analysis, health/readiness and query paths. API responses, authorized thumbnail/file routes, SSE, health/readiness and all errors have noindex/noarchive headers and no-store caching. Query variants of public pages use noindex and clean canonicals; no submitted URL enters metadata. Robots guidance is not authorization and blocked crawlers may not read noindex headers.

## Domain migration

Known public pages and crawler resources requested with the exact `www.tiksavemp4.online` Host permanently redirect to the fixed non-www canonical origin, discarding query strings. Untrusted forwarding headers and lookalike hosts cannot choose a redirect destination. API behavior is preserved and does not redirect sensitive download requests.

Provision DNS and a TLS certificate. At the edge, redirect HTTP and any owner-controlled former public domain to the preferred HTTPS origin. No former production domain was found or invented. Configure proxy trust to match the deployment topology. Development/test localhost addresses, TikTok sources, upstream documentation and malicious-domain test fixtures are not production canonical references and remain unchanged. Historical reference files and Git/dependency files are not edited.

Submit the canonical sitemap in the verified search-engine property after deployment. Previously indexed sensitive URLs may need a removal request in that property; crawler directives do not retroactively guarantee removal.

## Operational legal content

Privacy describes submitted URLs and metadata, in-memory records, temporary previews/videos, request IDs, IP rate limiting, browser headers, local theme storage, logs, TikTok/media-provider requests, security limits and retention. Ordinary request logging omits request bodies/query strings; the policy does not promise that errors or provider logs never contain full URLs. No analytics, ad or external error-monitoring service is invented. Before adding them, update the policy with actual providers and practices.

Terms cover acceptance, eligibility under applicable law, required permissions, source-dependent MP4 availability, prohibited restricted-content access and abusive use, interruptions and expiry, warranties and qualified liability limits that preserve non-excludable rights. Responsible Use gives allowed/prohibited examples, explains retained rights and explicitly rejects quality enhancement and artificial cropping/blurring/removal of ownership marks.

Copyright and DMCA describes temporary processing, complaint identification/contact/signature and good-faith/accuracy/authority statements, qualified counter-notice guidance and false-notice concerns. It claims neither a registered agent nor formal safe-harbor eligibility. The footer and legal pages state independence from TikTok/ByteDance and trademark ownership. Contact is configurable; no contact form or automatic enforcement process is claimed.

The owner must have these operational drafts reviewed for the applicable jurisdiction before commercial launch. Confirm operator identity, age/consumer requirements, liability/eligibility wording, copyright-agent and counter-notice obligations, privacy rights, hosting processors, security practices and real log/backup retention. Current default application settings are a 10-minute job/analysis lifetime, 30-second sweep and file access up to 60 seconds; the privacy page renders actual configuration. Cleanup failures/interrupted servers can delay removal; hosting logs and backups have no retention period established by this code.

References used for draft review: [FTC consumer privacy guidance](https://www.ftc.gov/business-guidance/privacy-security/consumer-privacy), [Copyright Office Section 512 guidance](https://www.copyright.gov/512/), [17 USC § 512](<https://uscode.house.gov/view.xhtml?req=(title:17%20section:512%20edition:prelim)>), [Schema.org WebApplication](https://schema.org/WebApplication). These references do not select a governing jurisdiction or establish compliance.

## Claims and domain audit

Searched repository-authored source, templates, scripts, JSON/CSS/public assets and documentation, excluding dependencies, historical Git data and the immutable `reference` directory. Active interface copy omits the prototype’s unsupported watermark, 4K, privacy, speed and usage claims. No fabricated metrics or guarantees were found. Legal denial statements and historical UI audit records remain accurate explanations, not promotional promises. The former social artwork’s “Interface preview” wording was replaced with current public-link/MP4 language. TikSaveMp4 is now the single brand across the UI, metadata, application code and documentation. Downloader routes, selection, API contracts and state behavior are unchanged.

## Verification and launch commands

The production-domain HEAD check on 8 October 2026 failed with curl exit 6 (“Could not resolve host”). This reports this environment’s DNS result, not a global claim that the domain does not exist. Live production headers and deployed content remain unverified.

Browser verification starts `node dist/server.js` locally with `NODE_ENV=production` and explicit `PUBLIC_BASE_URL=https://tiksavemp4.online`. The application serves locally while rendering production canonical metadata. Browser tests cover 390px, 768px and 1440px policy layouts, light/dark themes, content font sizes, overflow, navigation, and console errors. Existing downloader browser coverage also runs. Automated tests cover production environment requirements, metadata injection safety, JSON-LD parsing/escaping, XML escaping and content type, unique metadata, public routes, Host attacks, www redirects, local social-image dimensions/size, disclaimer/footer links and noindex file/SSE responses.

Final production commands after DNS/TLS/deployment (use `curl.exe` in Windows PowerShell):

```sh
curl -I https://tiksavemp4.online/
curl https://tiksavemp4.online/robots.txt
curl https://tiksavemp4.online/sitemap.xml
curl -I https://tiksavemp4.online/privacy
curl -I https://tiksavemp4.online/terms
curl -I https://tiksavemp4.online/responsible-use
curl -I https://tiksavemp4.online/copyright
```

Repeat locally against `http://127.0.0.1:3100` while running the production build. Verify HTTPS redirects, status codes, escaped XML and the production origin in rendered metadata. No deployment, DNS or search-console mutation was performed.

## Files changed for Command 11

- Configuration/security: `AGENTS.md`, `.env.example`, `README.md`, `src/config/env.ts`, `src/app.ts`, `src/middleware/error-handler.ts`.
- Public routing and SEO: `src/routes/public.ts`, `src/services/seo.ts`, `views/index.ejs`, `views/partials/head.ejs`.
- Legal content and navigation: `src/data/legal-pages.ts`, `views/legal.ejs`, `views/partials/header.ejs`, `views/partials/footer.ejs`, `src/styles/_legal.scss`, `src/styles/app.scss`.
- Assets: `src/artwork/og-image.svg`, `scripts/build-images.mjs`, `public/assets/og/tiksavemp4-social-card.jpg`, generated OG WebP variants; `src/styles/_tokens.scss` removes the previously blocked external Google font import.
- Verification: `tests/env.test.ts`, `tests/seo.test.ts`, `tests/e2e/seo.test.ts`, download/SSE header assertions in `tests/e2e/downloads.test.ts`, `tests/browser/legal.spec.ts`, `playwright.config.ts`, privacy light/dark screenshots and refreshed browser captures.
- Documentation: this file. Compiled CSS and browser assets are regenerated by the standard build.

Local production curl checks returned HTTP 200 and `text/html` for `/`, `/privacy`, `/terms`, `/responsible-use`, `/copyright` and `/contact`. The local robots response referenced the canonical sitemap. The sitemap contains exactly the five URLs required by Command 11 and intentionally omits Contact. The verification server was stopped afterward.
