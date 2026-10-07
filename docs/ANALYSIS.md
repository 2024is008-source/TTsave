# Public TikTok metadata analysis

`src/services/yt-dlp.ts` is the production metadata adapter. It validates the URL
again with the shared Zod schema before executing the configured binary. The
route forwards its request ID, logger and an abort signal; client disconnects
abort the signal and kill the child process. The default application never
selects the test metadata service.

## Execution and configuration

`child_process.spawn` receives an executable and a fixed argument array with
`shell: false`, hidden Windows windows and ignored stdin. The normalized URL is
the sole user-controlled argument, after `--`. No shell strings, user paths or
user filenames are constructed. The subprocess environment excludes application
secrets, proxy variables and Python plugin configuration.

Fixed flags disable configuration loading, plugin directories, cookie files,
browser cookies, cache files, playlists and geographic bypasses. Only the TikTok
and TikTokVM extractors are enabled. Simulation and single JSON output prevent
video downloads or metadata file writes. Flags follow the
[upstream yt-dlp documentation](https://github.com/yt-dlp/yt-dlp/blob/master/README.md).
No login credentials, imported cookies or access bypasses are supported.

| Variable                    | Default  | Accepted values                                      |
| --------------------------- | -------- | ---------------------------------------------------- |
| `YTDLP_PATH`                | `yt-dlp` | Approved tool name or local absolute executable path |
| `FFMPEG_PATH`               | `ffmpeg` | Approved tool name or local absolute executable path |
| `ANALYSIS_TIMEOUT_MS`       | 30000    | 1000–120000                                          |
| `ANALYSIS_MAX_OUTPUT_BYTES` | 2097152  | 65536–8388608                                        |
| `ANALYSIS_MAX_CONCURRENT`   | 2        | 1–8                                                  |

Relative custom paths, UNC paths, control characters and shell script launchers
are rejected. Operator-owned executable paths are trusted deployment settings;
clients cannot select them. Prefer absolute paths in production. Install the
binaries separately; the app does not install or update tools automatically.

Startup and `npm run tools:check` run bounded version commands for both tools,
verify their expected version banners and log availability with a startup request
ID. The CLI exits nonzero when either is missing. `/health` reports liveness;
`/ready` reports 503 when startup checks fail or shutdown starts. Checks use no
TikTok requests. Readiness is a startup snapshot, not a continuous external monitor.

## Process limits and errors

The deadline applies to the whole process; yt-dlp also has a 10-second socket
timeout and zero configured retries. Captured stdout and stderr count toward the
byte limit, with stderr additionally capped at 64 KiB. Abort, timeout and overflow
kill the child immediately. Graceful shutdown also stops active tool processes.
Concurrent analyses beyond the configured limit return
503 rather than growing an unbounded queue.

Diagnostic logs contain request IDs, exit codes, byte counts and application error
codes. Raw output, signed media URLs and stderr are never sent to clients or
included in those diagnostic logs. Known failures map to friendly restricted
access, regional restriction, missing video, source rate limit and generic extractor
errors. Missing tools return 503; timeout returns 504; malformed or oversized
extractor responses return 502. No failure triggers a retry using credentials or
another region.

## Metadata and format eligibility

Output is parsed as JSON, validated with Zod and projected into the API contract.
Internal headers, cookies, filenames and media URLs are discarded. Validated
extractor selectors remain server-only for job creation. Titles and creator names
are bounded. Durations and dimensions come
only from extractor data. Estimated bytes are supplied only from a positive,
safe integer `filesize`; `filesize_approx` is ignored. No dimensions, sizes or
quality improvements are inferred.

Only direct HTTPS, non-DRM MP4 formats with known video and audio codecs are
eligible for the implemented single-file delivery path. Audio-only, video-only,
unknown-codec, WebM, HLS, DASH, live, playlist and restricted-access results are
excluded. Local/IP-literal media destinations are excluded. At most 30 formats
are returned, with application IDs and labels based on actual dimensions. A 4K
source is never invented; its dimensions appear only if actually returned.

Remote thumbnails are omitted until a safe local thumbnail pipeline exists.
The production service requires a known positive duration within the configured
limit and a safe server-only format selector. Known oversized formats are excluded.
Eligible analyses set `downloadAvailable: true`. Jobs re-extract the validated
TikTok URL through yt-dlp; clients cannot submit media destinations. No arbitrary
URL fetching endpoint exists. See `DOWNLOAD_JOBS.md` for download limits.

Tests mock child processes and cover argument construction, normalization,
output bounds, timeout, cancellation, concurrency, safe failures and startup
availability. HTTP tests verify actual route wiring and disconnect handling.
Browser tests intercept analysis requests; no automated test uses live TikTok.
