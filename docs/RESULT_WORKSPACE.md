# Permanent hero downloader

The existing hero remains visible in every state: heading and form on the left,
one existing phone on the right, and a state card beside the phone. Mobile stacks
heading, input, primary action, phone, card and trust labels. The phone frame,
local idle artwork, background glows, header and following sections are retained.
Unsupported idle claims and decorative engagement numbers are removed.

Analysis updates the phone's local poster, creator, shortened title and duration.
A static play glyph identifies a poster preview; no signed video URL or remote
video embed is exposed. A failed thumbnail uses a labeled local fallback.

Ready, preparation, progress, completion and errors share the same side card.
Native radios retain public option IDs, which map to validated private extractor
selectors. Equivalent dimensions/container/audio/single-file delivery group into
one choice. Explicitly unwatermarked extractor variants are preferred internally;
compatibility, measured size and bitrate break ties. No watermark manipulation or
watermark-free guarantee exists. Four choices appear first, with additional
choices behind native details. The card stays at a 440px maximum with necessary
internal scrolling. The completion card uses verified backend quality and size.

Clear, cancellation and navigation stop active work. A download failure keeps its
valid analyzed preview and entered URL; Retry and Choose another quality reuse the
analysis. Completed jobs wait for explicit Save MP4. The backend file capability is
short lived and single use. Browser handoff does not confirm a successful save.

## Local thumbnail policy

Only the server-private trusted extractor thumbnail is fetched. No client API
accepts a thumbnail URL. HTTPS hosts must be an exact approved tiktokcdn.com,
tiktokcdn-us.com or tiktokcdn-eu.com host/subdomain. Encoded authorities,
credentials, ports and media-file URLs are rejected. DNS resolves IPv4 only;
private, loopback, link-local, multicast, shared and documentation destinations
are rejected. The HTTPS request pins a validated address and retains hostname TLS
verification. Each of at most two redirects repeats host and DNS validation.

Responses must be JPEG, PNG or WebP. The default input and encoded output limit is
3 MiB; the deadline is eight seconds. Sharp validates image bytes, restricts input
to 16 million pixels, rejects unsupported/animated formats and encodes bounded
WebP. A fixed filename sits in a unique server-controlled preview directory. The
browser receives only /api/v1/analysis/:analysisId/thumbnail?token=... with a
256-bit random capability. Retrieval validates token and regular file properties.
Cache-Control is private, no-store. CSP img-src stays self-only. Remote signed
URLs, paths and tokens are absent from diagnostic logs. Expiry, cancellation and
shutdown remove preview data; sweeps also remove aged preview orphans after restart.

## Verification

Offline unit, HTTP and browser suites exercise the contract, state machine,
authorization, measured progress, cancellation, verified file delivery and cleanup.
Browser layouts are checked at 390, 768, 1024 and 1440px with reduced motion.
State screenshots named state-_.png and ready-_.png use explicitly test-only
metadata and local artwork. Live screenshots named live-*.png use actual analysis
and download responses. See LIVE_VERIFICATION.md for real source results, the
upstream dimension mismatch, watermark observations and remaining limitations.
