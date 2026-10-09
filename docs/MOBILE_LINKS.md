# Secure mobile shared-link analysis

## Cause and change

The existing validator already accepted vm.tiktok.com and vt.tiktok.com, but YtDlpAnalyzer handed those URLs directly to the TikTokVM extractor. There was no Node-side, DNS-pinned redirect resolver or canonical-video normalization before extraction. This code-path finding explains the missing handling; a specific production failure was not reproduced because no real failing source or VPS access was supplied.

The analyzer now resolves mobile codes before calling the existing extractor. Full public URLs continue directly into extraction, normalized to `https://www.tiktok.com/@creator/video/{id}`. The resolver removes client tracking queries/fragments and canonical output omits upstream tracking. Extraction still determines public availability; reaching a video-shaped URL does not establish permission or bypass restrictions.

## Validation and redirect behavior

- HTTPS only; exact host membership: tiktok.com, www.tiktok.com, m.tiktok.com, vm.tiktok.com, vt.tiktok.com.
- Reject literal userinfo (including empty userinfo), every explicit port (including 443, preserving existing tests), encoded/Unicode/deceptive authorities, suffix/subdomain attacks, backslashes/control characters, path repairs and URLs over 2,048 characters.
- Submitted inputs retain the same narrow full-video or vm/vt short-code path validation. Intermediate server redirects may use other paths on the five exact approved hosts, including `/t/...`; terminal HTTP 200 must have an `/@creator/video/{numeric-id}` path. Login/challenge/HTML/JS redirects are not interpreted.
- Follow only HTTP 301/302/303/307/308 with a validated Location, at most THREE redirects (four requests). Relative and protocol-relative references are validated too. Loops, missing Location, invalid schemes/hosts and non-video terminal responses fail closed.
- Resolve all IPv4/IPv6 DNS answers on each hop. Reject the entire answer set if empty, nonpublic, malformed or family-inconsistent. IPv4 exclusions are shared with thumbnail requests and additionally reject Azure's platform endpoint 168.63.129.16. IPv6 permits ordinary 2000::/3 global unicast, conservatively excluding special-purpose/documentation/tunnel ranges. Loopback, private, link-local, multicast, reserved, mapped and NAT64 forms and metadata-service addresses are blocked.
- Pin the chosen address using a custom HTTPS lookup, explicit address family and a new nonpooled connection for every hop. Keep the URL hostname for TLS/SNI certificate validation; never disable verification. No second DNS lookup for that connection; a changed answer on the next hop is checked again.
- Two-second TCP/TLS connection deadline; two-second response-header deadline after TLS; eight-second total resolution deadline including DNS and all redirects, capped by the enclosing analysis budget. Extraction receives only the time remaining from the original analysis timeout. Client disconnect cancels resolution. No HTML body is buffered; headers are capped at 8 KiB.
- Fixed service headers only. No browser cookies, caller headers, Authorization or upstream Set-Cookie is forwarded or retained. Return only canonical metadata/safe errors; no raw DNS/TLS errors, extractor output or signed media URLs.
- Existing POST rate limits, application/analysis/download concurrency, body limits, download processing, capability authorization and public-only restrictions remain unchanged. The analysis concurrency slot covers the resolver and extractor together and is released on failure/cancellation.

Address-policy references: [IANA IPv6 special-purpose registry](https://www.iana.org/assignments/iana-ipv6-special-registry/), [Azure platform IP](https://learn.microsoft.com/en-us/azure/virtual-network/what-is-ip-address-168-63-129-16), [Node HTTPS API](https://nodejs.org/docs/latest-v24.x/api/https.html). Conservative exclusions deliberately reject special/tunnel address formats even when some suballocations could be globally reachable.

## Scope and remaining deployment boundary

DNS pinning and allowlisted redirect enforcement apply to the NEW Node short-link resolution requests. yt-dlp's later metadata/media API calls retain the existing extractor behavior and independently resolve their destinations. The OS/network egress containment prerequisite documented in DEPLOYMENT.md still applies to that child process; this change does not claim to sandbox all extractor networking. The resolver does not add a general proxy, cookie login, private-post access, regional bypass, or a mechanism to accept signed media URLs from clients.

No UI/templates/styles or MP4/MP3 workflow code changed. The generated frontend bundle changes only because shared validation was factored into a reusable strict authority schema. No production deployment or live-source verification was performed.

## Changed files

- `src/shared/video-url.ts`: reusable strict TikTok authority schema, unchanged submitted path restrictions.
- `src/services/public-address.ts`: shared IPv4 policy and conservative IPv6 public-address classification.
- `src/services/previews.ts`: imports/re-exports the shared IPv4 helper, including the additional Azure platform exclusion.
- `src/services/tiktok-link.ts`: bounded, DNS-pinned HTTPS resolver and canonical normalization.
- `src/services/yt-dlp.ts`: resolution inside the analysis slot and original timeout budget.
- `public/assets/js/downloader.js`: rebuilt shared validator.
- `tests/tiktok-link.test.ts`: deterministic network/security/deadline tests.
- `tests/e2e/mobile-links.test.ts`: real analyze-route integration with mocked network/extractor, output privacy and concurrency/cancellation.
- This document: cause, policy and verification scope.

## Final verification

| Command                              | Result                                                               |
| ------------------------------------ | -------------------------------------------------------------------- |
| `npm run lint`                       | pass                                                                 |
| `npm run typecheck`                  | pass, strict TypeScript                                              |
| `npm test -- --maxWorkers=1`         | 267 pass, 13 files                                                   |
| `npm run test:e2e -- --maxWorkers=1` | 96 pass, 8 files                                                     |
| `npx playwright test`                | 39 pass, 3.4 minutes                                                 |
| `npm run build`                      | pass: local images/CSS, generated browser bundle and compiled server |
| `git diff --check`                   | pass                                                                 |

Coverage includes vm/vt chains, relative redirects, three-hop boundary, loops/excess hops, external/deceptive hosts, ports/userinfo, malformed URLs, IPv4/IPv6 private/reserved/metadata answers, mixed DNS answers, pinning/rebinding, DNS/connection/header/total deadlines, cancellation, normalized extractor input, safe API output and unchanged concurrency. Existing full-link, URL-validator, thumbnail and MP4/MP3 tests pass.

All network tests use deterministic fixtures, not live TikTok availability. Browser tests validate the UI/API contract and existing MP4/MP3 behavior; they do not download real TikTok content. Generated screenshot/performance artifacts were restored after browser regressions to keep this change focused. No production deployment or automatic commit was performed.
