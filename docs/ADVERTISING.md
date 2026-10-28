# Optional Monetag advertising

Advertising ships **disabled**. No publisher IDs, official zone tags, provider domains, service worker, OnClick/Popunder, browser Push Notifications or MultiTag code are supplied. The two JSON examples intentionally have empty URLs and `reviewed: false`; they cannot be enabled as-is.

This integration is in the Express/EJS TTsave checkout. It does not replace the separate Next.js preview on port 3000. The homepage body, styles, SEO metadata, GA4 initializer and downloader contracts are preserved. Only eligible configured pages receive a deferred head initializer. No ad placeholders or consent banner are inserted into the homepage.

## Environment configuration

| Variable                    | Default | Purpose                                                                                                              |
| --------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `ADVERTISING_ENABLED`       | `false` | Global switch. Off means no manifest reads, initializer, bootstrap routes or additional advertising CSP permissions. |
| `MONETAG_IPP_ENABLED`       | `false` | Independent In-Page Push switch.                                                                                     |
| `MONETAG_VIGNETTE_ENABLED`  | `false` | Independent Vignette Banner switch.                                                                                  |
| `MONETAG_MOBILE_ENABLED`    | `false` | Opt-in for viewport widths below 768px, after reviewing actual mobile creatives.                                     |
| `MONETAG_IPP_TAG_FILE`      | empty   | Absolute private path to the In-Page Push JSON manifest.                                                             |
| `MONETAG_VIGNETTE_TAG_FILE` | empty   | Absolute private path to the Vignette Banner JSON manifest.                                                          |

Booleans accept `true`, `false`, `1`, `0`. An enabled format without valid reviewed configuration stops startup. Disabled formats grant no CSP permissions. Configuration is read when the router is created, so changes require a controlled application restart. No request parameter, visitor header, form input or cookie selects a tag or file.

Copy `config/monetag/*.example.json` into a private directory owned by the PM2 user, outside all web roots. Use restrictive filesystem permissions. `config/monetag/private/` is ignored by Git for local staging; production files should live outside the release checkout. Never use `public/`, user uploads or a credentials file. Real paths, including symlinks, are checked, and configuration/code files are limited to 64 KiB. These files are trusted publisher code, not a public upload mechanism.

## Adding the actual official tags later

Obtain individual **In-Page Push (Banner)** and **Vignette Banner** zones from your authenticated Monetag dashboard for the correct domain. Do not substitute another publisher's code, OnClick, browser Push Notifications or MultiTag. Keep `format` exactly `in-page-push` or `vignette-banner` for its corresponding environment setting. Set `reviewed: true` only after reviewing the zone, official code, required origins, privacy disclosures and placement. The application validates configuration; it cannot authenticate publisher ownership or certify arbitrary domains as belonging to Monetag.

Supported classic-script forms:

- **External tag:** `tag.kind` is `external`; `tag.src` is the exact HTTPS URL from the official script element; `tag.attributes` contains its required `data-*` attributes with their exact values. No ad URL is built in. Handlers, styles, HTML, module scripts and arbitrary attributes are rejected. The tag is appended asynchronously to `head` with `referrerpolicy="no-referrer"`.
- **Inline bootstrap:** save only the unchanged JavaScript between the official script tags in a private `.js` file. Set `tag` to an object with `kind: "bootstrap"` and `file` containing its absolute path. Keep original publisher identifiers unchanged. The app serves those exact JavaScript bytes through a digest-addressed same-origin route after the loader receives consent; it does not evaluate them on the server. HTML script wrappers are rejected. A bootstrap that depends on inline placement, its own script URL or module semantics needs explicit compatibility review with the real tag.

Each format is attempted once per document. Duplicate initialization, repeated consent callbacks and existing matching script elements cannot repeat it. Failed loads are not retried automatically. Identical configured external URLs or bootstrap contents across both slots are rejected. The integration never guesses zone IDs or rewrites provider frequency settings.

## Specific CSP origins

The `csp` object accepts arrays named `scriptSrc`, `connectSrc`, `imgSrc`, `frameSrc`, `styleSrc`, `fontSrc`, `mediaSrc`. Populate them only with exact origins verified against your official tags and Monetag's guidance for those zones. Values must be HTTPS origins without paths, ports, credentials or wildcard hosts. Empty arrays grant nothing. An external tag's origin must also appear explicitly in `scriptSrc`.

No Monetag origin is guessed. Do not add `*`, `https:`, wildcard subdomains, eval permissions, inline-script permissions, `blob:`, `data:` or unverified descendants to make a blocked creative work. Check blocked resources with Monetag before allowlisting them. Existing GA4 script/collection sources are preserved. Advertising grants no additional inline-script/eval permission. On advertising pages, style sources retain the application's existing inline-style permission and otherwise use self plus reviewed origins; frame/font/media sources are self plus reviewed origins. Existing downloader progress styles still work.

CSP limits requests, not what approved same-page code can read. Provider scripts have page access, so review their collection and interaction behavior before activation. Inline bootstrap contents are deliberately not sanitized or rewritten: supplying them is an operator code-trust decision.

## Advertising consent and withdrawal

Consent is required independently of GA4, with no automatic-approval or bypass setting. The loader does not read analytics consent, infer consent from a country, store an ad identifier or create a consent cookie. Your consent management platform (CMP) owns the consent UI, notices, purposes/vendors, consent records, expiry and withdrawal. Connect its advertising-purpose callback before live activation. With no CMP callback, provider scripts never load even if all environment switches are true. No CMP vendor or domain is invented here.

From your existing **external CMP adapter module**, after a valid advertising decision, dispatch:

```js
window.dispatchEvent(
  new CustomEvent('ttsave:advertising-consent', {
    detail: { version: 1, advertising: true },
  }),
);
```

Use `advertising: false` on rejection/withdrawal. Alternatively call `window.tikSaveAdvertising?.setConsent(true)` or `.setConsent(false)` from that trusted adapter. `getState()` reports consent, attempted formats, the current blocking reason and whether a safe reload is required. Register the adapter early and listen for `ttsave:advertising-ready` to replay the CMP's current valid decision when this deferred loader initializes. Never dispatch true automatically, from GA consent, or from the first ordinary site click.

Global Privacy Control and `navigator.doNotTrack === '1'` suppress ads even after a positive callback. The CMP can apply stricter regional rules. This bridge is not a vendor-certified TCF/CMP implementation or a substitute for provider-specific consent requirements.

Withdrawal cancels pending tags and blocks new starts. JavaScript already executed by a provider cannot be undone by removing its script element. The loader then emits `ttsave:advertising-reload-required`; the CMP should offer a safe reload without interrupting a download. The loader does not force a reload or cancel jobs. Provider cookies/prior processing require the CMP/provider withdrawal process. A conditional disclosure appears on `/privacy` when reviewed slots are enabled; publish actual operator/vendor/partner information and retention details in the CMP before activation.

## Page and interaction exclusions

Eligible documents are `/`, `/blog`, and existing published `/blog/:slug` articles. Legal/support pages, admin/authentication, APIs, previews, SSE/status responses, file delivery, health/readiness, crawler files, redirects and error responses are excluded. Query-string pages are excluded on the server; fragments and page-path changes also block loading in the browser. Bootstrap URLs contain no TikTok URL/capability and return no-store, nosniff, same-origin, noindex JavaScript. Disabled/unknown routes return 404. Render failures drop advertising CSP permissions.

The loader waits at least three seconds, runs asynchronously and requires a visible document. On the homepage, the complete idle downloader/hero must be outside the viewport. Navigation must be closed. Focus, key, pointer or submit interaction in the downloader/header locks out further starts for that document. A populated input or non-idle downloader state also blocks them. No provider markup is inserted into inputs, buttons, loading states or results. Application events are never cancelled or stopped.

These safeguards govern when provider code starts. They cannot control creatives after that code executes. Monetag describes Vignette Banner as an overlay format: actual timing, close controls, frequency, IPP position and landing behavior require provider review. Verify real creatives against mobile navigation and every download state before setting `MONETAG_MOBILE_ENABLED=true`. If an ad obstructs controls, keep that format disabled and have Monetag correct the placement. Never hide or disguise ads as downloader controls.

## Safe verification

```text
npm run check
npm run test:ui -- tests/browser/advertising.spec.ts tests/browser/analytics.spec.ts tests/browser/downloader.spec.ts
npm run format:check
```

Tests use labelled inert local fixtures, not real Monetag code. Browser tests block HTTPS third-party traffic and execute only same-origin fixture scripts. They never register notifications, click ads, generate real ad impressions or hit a real GA property. Coverage includes global/independent flags, invalid configuration, exact CSP, private/error exclusions, exact bootstrap delivery, unchanged homepage body/SEO/GA4, consent/privacy signals, deduplication, initial deferral, mobile overflow/navigation and downloader usability. Loader test payloads are bounded below 12 KiB and no provider payload is requested before consent. Screenshots are saved to `docs/screenshots/advertising/` with Playwright attachments in `test-results/`.

Fixtures do not establish real provider delivery, creative safety, CPU cost or live LCP/INP/CLS impact. Before authorized activation, supply actual tags and verified domains, connect the CMP, verify current provider privacy requirements, inspect rejected/accepted-consent network traffic, review real creatives on phones/tablets/desktop, measure cold-cache performance and exercise all download states. Use Monetag's approved testing process, never automated ad clicks or simulated production impressions. Keep the global switch false until these checks pass.

Rollback: set `ADVERTISING_ENABLED=false` and use your normal controlled restart after approval. New documents have no loader, bootstrap routes or extra CSP permissions. Already open documents need a safe refresh; a server switch cannot unexecute browser code. No deployment, production restart, DNS change, commit or push was performed.

## Official references

- [Monetag In-Page Push](https://help.monetag.com/en/articles/6959534-in-page-push-ipp)
- [Monetag Vignette Banner](https://help.monetag.com/en/articles/6725606-vignette-banner)
- [Official tag placement](https://help.monetag.com/en/articles/6726318-how-do-i-get-started-as-a-publisher-paste-the-ad-tag-into-your-website)
- [Avoiding duplicate tags](https://help.monetag.com/en/articles/6726726-how-many-ads-can-i-place-on-one-webpage)
