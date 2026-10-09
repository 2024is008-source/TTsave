# TikSaveMp4 API v1

Zod validates requests and responses. API responses disable caching, carry
`X-Request-ID` and are rate limited. Production extracts public TikTok sources.

| Method and path                                      | Request                                                  | Success                          |
| ---------------------------------------------------- | -------------------------------------------------------- | -------------------------------- |
| `POST /api/v1/analyze`                               | `{ "url": "https://www.tiktok.com/@creator/video/123" }` | 200 analysis                     |
| `GET /api/v1/analysis/:analysisId/thumbnail?token=…` | Random preview capability                                | 200 local WebP                   |
| `POST /api/v1/downloads`                             | `{ "analysisId": "<UUID>", "formatId": "source-1" }`     | 201 job and access token         |
| `GET /api/v1/downloads/:jobId`                       | Bearer access token                                      | 200 job                          |
| `GET /api/v1/downloads/:jobId/events`                | Bearer access token                                      | 200 SSE stream                   |
| `GET /api/v1/downloads/:jobId/file?token=…`          | One-use file token                                       | 200 authorized media attachment  |
| `DELETE /api/v1/downloads/:jobId`                    | Bearer access token                                      | 200 job; idempotent cancellation |
| `GET /health`                                        | None                                                     | 200 liveness                     |
| `GET /ready`                                         | None                                                     | 200 ready or 503 not ready       |

Analysis contains `id`, `title`, `creator`, `thumbnail`, `durationSeconds`,
`sourceUrl`, `formats`, `mock`, `downloadAvailable`, and `capabilities: { mp4, mp3 }`. Formats contain `id`,
`container`, `qualityLabel`, `hasAudio` and optional dimensions and `estimatedBytes`.
Unknown size is omitted. Thumbnails use the authorized local image policy in
`RESULT_WORKSPACE.md`; unavailable or unapproved thumbnails are `null`. Eligible responses
have `mock: false`, `downloadAvailable: true` and known duration within the limit.

Jobs contain `id`, `analysisId`, `formatId`, `status`, `mock` and optional
`progress`, `fileUrl`, `fileExpiresAt`, `deliveredFormat`, `error`. `deliveredFormat`
contains verified MP4 dimensions or an MP3 audio descriptor, quality label and audio availability.
Only creation returns `accessToken`;
send `Authorization: Bearer <accessToken>` for lookup, events and cancellation.
States are `queued`, `downloading`, `ready`, `delivering`, `delivered`, `cancelled`,
`error`, `expired`.

SSE sends JSON as `event: job`, starting with the current snapshot. Progress fields
`downloadedBytes`, `percent`, `speedBytesPerSecond`, `sizeBytes` exist only when measured data is
available. Unknown totals produce indeterminate progress. Heartbeats are comments.
Terminal events close the stream; the last subscriber disconnect cancels active
work. Up to five subscribers are allowed per job.

Ready jobs supply a separate expiring one-use file URL. Delivery uses
`Content-Disposition: attachment; filename="TikSaveMp4-video.mp4"`. HEAD and Range
requests are rejected. Successful or disconnected delivery consumes the token
and deletes temporary data. Filesystem paths never appear in responses.

Errors use `{ "error": { "code", "message", "retryable", "fieldErrors", "requestId" } }`.
`fieldErrors` is always an object. Stack traces and raw internal output are excluded.
Validation returns 400; missing records 404; missing authorization 401; incorrect
tokens 403; unavailable files 409; expired records 410; oversized output 413;
capacity exhaustion 503; timeout 504. Failed job snapshots carry the same safe
error fields. Errors before SSE opens use JSON.

For audio, submit `{ "analysisId": "<UUID>", "downloadType": "mp3" }` without
`formatId`. The server chooses an eligible source; MP3 must be advertised as
available by analysis. Other download types and extra request fields are rejected.
Explicit MP4 requests may include `downloadType: "mp4"`; existing MP4 request bodies
remain valid. Jobs include `downloadType`. Conversion progress has
`phase: "converting"` and no invented metrics. MP3 delivery uses `audio/mpeg` and
a sanitized metadata-based `.mp3` attachment name with the same authorization,
expiry and private caching policy. See [MP3_DOWNLOADS.md](MP3_DOWNLOADS.md) for
conversion settings, cleanup, verification and limitations.

Only approved HTTPS TikTok hosts are accepted. Credentials, ports, encoded hosts,
lookalikes and extra request fields are rejected. Clients cannot supply paths or
filenames. Only an analyzed format can create a job. See `URL_VALIDATION.md`,
`ANALYSIS.md` and `DOWNLOAD_JOBS.md` for details and configurable limits.

State belongs to one process. Restart loses capabilities and analyses; periodic
cleanup removes aged orphan directories. Readiness reflects startup tool
availability and shutdown, not whether TikTok or a particular video is accessible.

## Public photo posts and selected-image archives

Photo analysis uses the existing `postType: "photo"` discriminator, `capabilities.images`, opaque UUID photo IDs, one-based original positions and local capability-protected preview URLs. It never returns upstream image URLs, signed media addresses, cookies, extractor headers or raw output. Video normalization and MP4/MP3 contracts remain unchanged.

`GET /api/v1/analysis/:analysisId/photos/:photoId/preview?token=...` requires a valid unexpired analysis capability and a photo belonging to that post. Previews are contained WebP images no larger than 480 × 480; original JPEG/PNG/WebP downloads retain source bytes and aspect ratio.

Individual intent: `{ "analysisId": "<UUID>", "photoId": "<UUID>", "capability": "<token>", "downloadType": "image" }`.

Selected intent: `{ "analysisId": "<UUID>", "photoIds": ["<UUID>", "<UUID>"], "capability": "<token>", "downloadType": "image" }`.

Exactly one of `photoId` and `photoIds` is required. Selection arrays contain 1–35 distinct UUIDs; every ID must belong to the authorized post. Unknown fields and arbitrary URLs, filenames, paths, titles or selectors are rejected. Client ordering is ignored in favor of original post order. A one-item array returns the verified image MIME and extension. Several items produce `application/zip`, with safe numbered names and original image bytes. Jobs may include `photoCount`.

Image jobs reuse existing rate limits, status/SSE/cancel authorization, separate one-use file capabilities, private/no-store caching and guarded temporary cleanup. Raw combined images are limited to 64 MiB; each image to 12 MiB and 40 million decoded pixels. The configured `DOWNLOAD_MAX_BYTES` additionally bounds the complete output, including ZIP headers. One archive is processed at a time with sequential upstream image retrieval; archive work also occupies the existing download/application slots. Processing has a maximum 60-second budget or the existing configured download timeout if lower. No progress is fabricated.
