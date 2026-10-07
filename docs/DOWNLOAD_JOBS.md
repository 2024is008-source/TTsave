# Single-server download jobs

The production service owns bounded in-memory Maps for analyses and jobs. Deploy
one process; there is no distributed queue or restart persistence. Requests over
capacity fail. Analysis, active downloads and transfers share an operation budget.

| Environment variable         | Default                      | Purpose                       |
| ---------------------------- | ---------------------------- | ----------------------------- |
| `DOWNLOAD_MAX_CONCURRENT`    | 2                            | Active download limit         |
| `APPLICATION_MAX_CONCURRENT` | 4                            | Shared operation limit        |
| `DOWNLOAD_TIMEOUT_MS`        | 120000                       | Whole-job deadline            |
| `MAX_VIDEO_DURATION_SECONDS` | 600                          | Maximum known duration        |
| `DOWNLOAD_MAX_BYTES`         | 104857600                    | Maximum output bytes          |
| `JOB_TTL_MS`                 | 600000                       | Job retention and orphan age  |
| `FILE_ACCESS_TTL_MS`         | 60000                        | Completed file access window  |
| `JOB_SWEEP_INTERVAL_MS`      | 30000                        | Periodic cleanup interval     |
| `DOWNLOAD_TEMP_ROOT`         | OS temp directory + `ttsave` | Operator-owned temporary root |

Configuration is validated. Each job uses `mkdtemp` beneath a local absolute root.
IDs are random UUIDs; job and separate file capabilities each contain 256 random
bits. Token comparisons use constant-time comparison after syntax validation.

Creation validates an unexpired analysis and its returned format. The extractor
selector remains private. yt-dlp receives fixed arguments, that selector and the
validated TikTok URL through `spawn` with `shell: false`. Configuration, plugins,
cookies, browser cookies, playlists and regional bypasses are disabled. The output
filename is server-owned `video.mp4`. No request accepts paths or filenames.

This version delivers progressive HTTPS MP4 formats containing video and audio.
Separate streams, HLS and DASH are excluded. These formats need no merge; FFmpeg
is not invoked for them. Startup still verifies both tools.

Only prefixed JSON from the structured progress template is parsed. Estimated
totals and human-readable progress lines are ignored. Percentage requires measured
downloaded and total bytes; speed requires a measured value. Completion validates
a regular, non-symlink MP4 and actual positive file size. Known oversized formats
are excluded; yt-dlp receives size and duration filters. Progress rejects excessive
sizes and disk usage is checked every 250 ms. Polling can briefly observe an
overshoot; final validation prevents delivery of an oversized file. The deadline
covers setup and extraction.

Cancellation, timeout, failure, last SSE subscriber disconnect and shutdown abort
the child. Cleanup waits for process closure. SSE uses authenticated fetch
streaming. Snapshots contain no access tokens or paths. Slow event clients are
disconnected. A creation request that disconnects also cancels its job.

Ready files have a separate expiring one-use URL. Claiming it atomically changes
the job to `delivering`; the server streams a fixed safe attachment filename.
Tokens are omitted from request logs. Completed or interrupted transfers consume
access and delete data. Cancellation aborts active delivery and waits for cleanup.
Browser handoff means a download was requested, not that it was saved.

Periodic sweeps expire jobs and file tokens, delete data and remove expired records.
They remove aged untracked `job-` directories after restart, even before the first
new job. Recursive removal checks resolved paths remain immediately beneath the
configured root. Other directory names are preserved. Failed cleanup is safely
logged and retried.

Tests use mocked processes and fixtures for validation, concurrency, measured
progress, cancellation, deadlines, output limits, authorization, one-use delivery,
disconnects and cleanup. No test contacts TikTok.
