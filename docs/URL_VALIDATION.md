# TikTok URL validation

`src/shared/video-url.ts` defines the single Zod schema used by the frontend,
versioned API, response contracts and legacy form endpoint. It performs no DNS
lookup or HTTP request. Passing validation does not establish public availability;
a real provider must separately check that without bypassing access restrictions.

Only literal ASCII hosts `tiktok.com`, `www.tiktok.com`, `m.tiktok.com`,
`vm.tiktok.com` and `vt.tiktok.com` are allowed, using exact membership after
lowercasing. Video hosts accept `/@handle/video/<digits>`; short-link hosts accept
a single alphanumeric token. A trailing path slash and sharing query parameters
are accepted. Outer paste whitespace is trimmed and the returned URL has a
lowercase scheme and hostname. Handle and token casing is preserved.

Input and normalized output are limited to 2,048 characters. Empty or nonstring
inputs, plain usernames, malformed URLs, non-HTTPS schemes, embedded credentials
(including empty userinfo), explicit ports, trailing host dots, internal whitespace,
control characters, backslashes and repaired traversal paths are rejected.
Percent-encoded and Unicode authorities are rejected before the URL parser can
normalize them. Encoded sharing query parameters remain valid.

Exact host checks reject non-TikTok and lookalike domains, attacker-controlled
subdomains, localhost and all IP literals, including private IPv4, IPv6 loopback,
link-local and unique-local addresses. No substring, suffix or hostname decoding
is used to grant access. This validator is not a redirect or DNS safety mechanism;
any future resolver needs independent destination checks on every network hop.

Frontend errors use the schema's friendly messages. API field errors use only
allowlisted URL messages and never echo the input or reveal Zod internals. Unit
tests cover the accepted forms, normalization, limits and attack matrix;
integration tests prove invalid input never reaches the analysis service.
