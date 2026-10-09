# USA SEO audit — October 9, 2026

Inspected repository rules and immutable design references, Express routes, EJS partials, legal copy, downloader/MP3 services, artwork pipeline, styles, and SEO/environment/browser tests before implementation.

## Findings before edits

- Homepage title and H1 describe a generic downloader rather than TikTok to MP4 intent. Most homepage copy mentions only MP4 even though MP3 extraction/conversion and tests exist.
- HTML uses `en`; Open Graph already uses `en_US`.
- Safe WebApplication JSON-LD exists but describes only MP4 and omits language. Visible FAQs omit conversion, audio, reuse rights, failure causes and temporary storage; FAQPage data is absent.
- Canonicals already use Zod-validated `PUBLIC_BASE_URL`, with unique page URLs and query-free canonicals. Exact www aliases redirect, but case variants of public paths render duplicates. HTTP termination/redirects require deployment configuration.
- Robots already disallows actual API, analysis, health/readiness and query routes. API/file/event/thumbnail responses already have noindex and no-store headers. Sitemap contains the homepage and four policy pages; Contact is also public/indexable but omitted.
- Unknown routes return genuine HTTP 404 with JSON; browser visitors need a custom HTML 404 while API clients retain JSON.
- Local JPEG sharing artwork is 1200×630 and the build compresses it, but its copy only mentions MP4. Social metadata lacks Twitter image alternative text.
- Local responsive WebP images already have dimensions, appropriate eager/lazy loading and a high-priority hero. Module scripts defer automatically; system fonts avoid external font requests. Reduced motion and mobile navigation already exist. Static responses lack an explicit freshness window.
- Footer links reach all policies and Contact; homepage has no distinct, useful visible reuse-rights section.
- Setup, privacy-conscious measurement, a 90-day off-site plan and honest outreach templates need dedicated documentation. No ranking, backlink or field performance data is available in the repository.

Implementation and verification results are recorded in SEO_RESULTS.md. No reference files, external accounts, backlinks or messages are changed by this task.
