# Search and measurement setup

Production origin: `https://tiksavemp4.online`. Audience: United States; interface language: `en-US`. No geographic address, doorway pages or verification tokens are invented. These steps are manual owner actions after deployment; this task does not create accounts or submit URLs.

## Deploy and verify first

Use Node.js 24 LTS and set `NODE_ENV=production` and `PUBLIC_BASE_URL=https://tiksavemp4.online`. Provision DNS and valid certificates for both apex and www. Configure a single edge redirect from HTTP or www directly to the final HTTPS non-www URL, including clean public paths, to avoid chains. API methods and signed download URLs must keep their existing behavior; never redirect sensitive requests to unrelated routes.

The application redirects known public www/case/trailing-slash variants to URLs built from validated configuration. In production it also redirects insecure requests for the exact public apex host. Localhost development remains accessible. If TLS terminates at a proxy, `TRUST_PROXY=true` is appropriate only when the origin is inaccessible to direct clients and the trusted edge overwrites forwarding headers. Otherwise an attacker can spoof protocol/IP information. Prefer the edge for HTTPS enforcement on assets and all routes. Canonical URLs never derive from Host or forwarding headers.

Run with `curl.exe` on Windows:

```sh
curl -I https://tiksavemp4.online/
curl -I http://tiksavemp4.online/
curl -I https://www.tiksavemp4.online/
curl -I http://www.tiksavemp4.online/
curl https://tiksavemp4.online/robots.txt
curl https://tiksavemp4.online/sitemap.xml
curl https://tiksavemp4.online/
curl -I https://tiksavemp4.online/privacy
curl -I https://tiksavemp4.online/terms
curl -I https://tiksavemp4.online/responsible-use
curl -I https://tiksavemp4.online/copyright
curl -I https://tiksavemp4.online/contact
curl -I https://tiksavemp4.online/health
curl -H 'Accept: text/html' -I https://tiksavemp4.online/missing-page
```

Expect 200 on canonical public pages, robots and sitemap; one redirect to the preferred origin for aliases; 404 on missing pages; and `X-Robots-Tag: noindex, nofollow, noarchive` on health/readiness, API/processing, preview, file and event routes. Download/file checks require a genuine authorized temporary job; do not expose tokens in reports. Robots is crawl guidance, not security or a substitute for noindex headers. Do not block CSS, JavaScript or images. Query/result-state URLs stay out of the sitemap and render noindex headers when applicable. Public canonical metadata must contain no tracking parameters.

## Google Search Console

1. Sign in at [Search Console](https://search.google.com/search-console). Add a **Domain** property for `tiksavemp4.online`.
2. Copy the supplied DNS TXT verification record into the domain's DNS console. Keep the record after verification. No application token is necessary for DNS verification. [Property setup guidance](https://support.google.com/webmasters/answer/10351509?hl=en).
3. Open Sitemaps and submit `https://tiksavemp4.online/sitemap.xml`. Check fetch status and discovered URLs.
4. Inspect `https://tiksavemp4.online/` using [URL Inspection](https://support.google.com/webmasters/answer/9012289?hl=en). Test the live URL and confirm rendered content, crawl access and the declared canonical. After the production changes are deployed, request indexing. A request does not guarantee indexing.
5. Review Pages for crawl/indexing exclusions, soft 404s and duplicate canonical decisions. Confirm each policy page remains reachable.
6. In Search results performance, filter Country to United States and review pages, queries, clicks, impressions, CTR and average position for comparable date ranges. Compare the homepage's MP4/MP3 query groups without treating position as a guaranteed ranking.
7. Review Core Web Vitals by mobile/desktop. Run [PageSpeed Insights](https://pagespeed.web.dev/) and [Rich Results Test](https://search.google.com/test/rich-results) only when the deployed page is publicly reachable. Validate JSON-LD syntax separately; valid WebApplication/FAQPage data does not guarantee a Google rich result. Consult current [Google structured-data documentation](https://developers.google.com/search/docs/appearance/structured-data/search-gallery) for supported features rather than promising FAQ enhancements.

## Bing Webmaster Tools

1. Sign in at [Bing Webmaster Tools](https://www.bing.com/webmasters/). Add `https://tiksavemp4.online/` manually or import an owner-verified Search Console property.
2. Follow the offered DNS/Domain Connect verification method. If using a meta/XML verification method instead, use the real owner-provided token through validated secure deployment configuration; do not hard-code example tokens or publish credentials. [Add and verify instructions](https://www2.bing.com/webmasters/help/add-and-verify-site-12184f8b).
3. Submit the same sitemap in Sitemaps and confirm its fetch status. [Bing sitemap instructions](https://www2.bing.com/webmasters/help/sitemaps-3b5cf6ed).
4. Review URL Inspection, indexing/crawl errors and search performance. Recheck robots, response status and canonical choices after releases. Submission does not guarantee indexing.

## Privacy-conscious measurement

FAQPage describes the visible questions accurately. Google retired FAQ rich results in May 2026 and removed that feature's documentation in June 2026; do not expect FAQ rich results or add fake ratings/pricing to satisfy other rich-result requirements. See [Google's documentation updates](https://developers.google.com/search/updates#june-2026).

The project now offers optional GA4 public-page views through `GA_MEASUREMENT_ID`; see [ANALYTICS.md](ANALYTICS.md) before enabling it. Confirm retention and consent arrangements and disable Enhanced Measurement in the web stream. Search Console/Bing remain separate sources for search metrics.

The application's only explicit Analytics event is `page_view`, using canonical public-page location, static site title and empty referrer. Do not add downloader events, session replay, form capture or DOM collection. Never attach TikTok URLs, signed media URLs, tokens, downloaded filenames, TikTok titles or creator handles. Google receives technical network/browser information through its tag and collection requests as disclosed in the Privacy Policy; do not claim anonymous measurement. Queries and fragments are excluded from page metadata.

| Measure                               | Source and definition                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Organic sessions; US organic traffic  | Owner-configured, privacy-conscious analytics with a documented session/country methodology; not inferred from search clicks                     |
| Impressions, clicks, average position | Google Search Console, with United States filter; Bing tracked separately                                                                        |
| Indexed pages                         | Search Console Pages and Bing indexing reports                                                                                                   |
| Successful analyses                   | First-party count of completed valid analysis responses; no source identifiers                                                                   |
| Successful downloads                  | Count server deliveries that finish successfully; job-ready or button-click counts are separate and do not prove a file reached a device/library |
| Error rate                            | Failed eligible analyses/download attempts divided by all such attempts; use coarse allowlisted codes and avoid duplicate retries                |
| Core Web Vitals                       | Search Console/CrUX field LCP, INP and CLS; PageSpeed lab runs recorded separately                                                               |
| Referral traffic                      | Aggregate referring domains and sessions without signed/referrer URL paths                                                                       |

Record a real baseline after deployment. Review weekly; compare equivalent periods monthly, annotate releases and outages, and account for sample size. No SEO uplift, traffic improvement or backlink acquisition is established by code changes alone.

## Performance checks

Existing responsive WebP assets, dimensions, eager/high-priority hero, lazy below-fold art, module scripts, system fonts and reduced motion are retained. System fonts require no font download or `font-display`; any future self-hosted font must use `font-display: swap`. Static assets use one-hour freshness plus ETag/Last-Modified revalidation, without immutable caching because filenames are stable. Deploy text compression at the hosting edge, retaining correct MIME types. Public HTML stays revalidated so retention/configuration and metadata do not become stale.

Check TTFB, LCP, INP, CLS and transfer sizes with real deployment/browser data; record test date, location, viewport and network conditions. Downloader state changes are intentional interactions; retain existing preview/workspace geometry and assess them separately. Do not claim field Core Web Vitals gains from local tests or asset byte counts.
