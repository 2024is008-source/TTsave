# TTSave API v1

Zod schemas in `src/api/contracts.ts` are the executable contract. Requests and
service responses are validated. All API responses disable caching. All routes
return `X-Request-ID`; application requests are rate limited.

Production metadata analysis uses yt-dlp with anonymous access to validated public
TikTok links. Responses carry `mock: false` and `downloadAvailable: false`.
Unknown creator and duration are `null`; format dimensions and byte counts are
omitted when unknown. `thumbnail` is currently `null` because thumbnail copying
is not implemented and production images must not be hotlinked. See `ANALYSIS.md`.

## Endpoints

| Method and path                       | Request                                                  | Success                                                         |
| ------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| `POST /api/v1/analyze`                | `{ "url": "https://www.tiktok.com/@creator/video/123" }` | 200 analysis                                                    |
| `POST /api/v1/downloads`              | `{ "analysisId": "<UUID>", "formatId": "source-1" }`     | Production: 503 `DOWNLOADER_UNAVAILABLE`; test service: 201 job |
| `GET /api/v1/downloads/:jobId`        | UUID job ID                                              | 200 job                                                         |
| `GET /api/v1/downloads/:jobId/events` | UUID job ID                                              | 200 SSE stream                                                  |
| `GET /api/v1/downloads/:jobId/file`   | UUID job ID                                              | 409 `FILE_UNAVAILABLE` for existing mock jobs                   |
| `DELETE /api/v1/downloads/:jobId`     | UUID job ID                                              | 200 cancelled job; idempotent                                   |
| `GET /health`                         | None                                                     | 200 `{ "status": "ok" }`                                        |
| `GET /ready`                          | None                                                     | 200 ready or 503 not-ready, based on startup tool checks        |

Analysis contains `id`, `title`, `creator`, `thumbnail`, `durationSeconds`,
`sourceUrl`, `formats`, `mock` and `downloadAvailable`. A format contains `id`, `container`,
`qualityLabel` and `hasAudio`, with optional `width`, `height` and
`estimatedBytes`. The browser maps these fields directly to its display model.

The in-memory job contract remains tested using an injected test service; no real
download jobs can be created in production yet. Jobs contain `id`, `analysisId`,
`formatId`, `status` and `mock`. Test job status is
`queued` until explicit cancellation; there are no timed completion transitions,
progress metrics or downloadable fixtures. SSE sends the current job immediately
as `event: job` with JSON in `data`, sends cancellation updates, and closes on
cancellation. Disconnecting releases the subscription. Up to five concurrent
subscriptions per job are allowed. No heartbeat or simulated progress is sent.

The frontend disables file requests when analysis reports download unavailability.
Tests exercise event streaming and cancellation. File delivery remains future
work. No frontend mock adapter is shipped.

## Errors and limits

Errors use this envelope, without stacks, exception messages or validation internals:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request was invalid.",
    "retryable": false,
    "fieldErrors": { "url": ["The supplied value is missing or invalid."] },
    "requestId": "<request UUID>"
  }
}
```

`fieldErrors` is always an object, empty when no input field applies. Retryable is
true for 429 and 5xx errors. Malformed JSON returns 400; oversized bodies return 413. Missing analyses/jobs return 404, unknown formats return 400, unavailable
files return 409, capacity exhaustion returns 503 and unexpected service failures
return 500 with a generic message. Errors before opening SSE use the same JSON
envelope.

Only HTTPS canonical TikTok video links on `tiktok.com`, `www.tiktok.com` and
`m.tiktok.com`, plus `vm.tiktok.com`/`vt.tiktok.com` short links, are accepted.
Credentials, explicit ports, encoded hosts, other hosts, missing inputs and extra body fields
are rejected. See `URL_VALIDATION.md` for normalization, limits and attack cases.
URL syntax does not prove that a post is public. Users cannot supply
paths or filenames. IDs are server-generated UUIDs; only a format returned for
that analysis can create a job.

Each app instance owns its memory store. It holds at most 200 analyses and 200
jobs; entries expire after 30 minutes and are pruned on access. Active event
subscriptions retain their jobs until disconnect. Restarting discards all state.
Readiness reflects startup availability of yt-dlp and FFmpeg, plus shutdown state;
it does not guarantee that TikTok is reachable or a particular video is public.
No persistence or real file downloader is implemented.
