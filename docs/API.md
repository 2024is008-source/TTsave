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
| `GET /api/v1/downloads/:jobId/file?token=…`          | One-use file token                                       | 200 MP4 attachment               |
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
