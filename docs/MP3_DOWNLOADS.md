# MP3 audio in the result panel

TikSaveMp4 now offers MP4 Video and MP3 Audio in the existing analyzed-video panel. MP4 remains the default. Switching to audio preserves the analyzed metadata and the previous MP4 quality; switching back restores it. A new analysis resets the selection. MP3 is disabled with an explanation when the backend does not advertise availability.

## API and validation

`POST /api/v1/analyze` includes `capabilities: { mp4, mp3 }`. Audio requires a supported source with audio and startup verification of yt-dlp, FFmpeg, FFprobe and the libmp3lame encoder. Extractor URLs, audio selectors and local paths remain server-side.

`POST /api/v1/downloads` accepts either:

```json
{
  "analysisId": "opaque-analysis-uuid",
  "formatId": "opaque-video-option",
  "downloadType": "mp4"
}
```

```json
{ "analysisId": "opaque-analysis-uuid", "downloadType": "mp3" }
```

Existing MP4 requests without `downloadType` remain supported. Zod rejects other media types and additional fields, including URL overrides, output paths, filenames and extractor selectors. The service revalidates the stored public TikTok URL and verifies the stored format. The server chooses the source for audio; the browser's prior MP4 selection is not submitted for MP3.

Jobs include `downloadType`. During conversion, SSE progress contains `phase: "converting"` without a percentage, speed or estimated size. The completed job returns an MP3 delivered-format descriptor and its measured file size. The existing authorization, expiry and single-use file flow applies.

## Conversion and delivery

1. Reserve the existing application/download concurrency slot and check available temporary-disk capacity.
2. Create a unique server-owned job directory and retrieve the supported MP4 source with yt-dlp. When source audio bitrates are supplied, choose the highest among the supported video sources.
3. Verify the downloaded source, then run FFmpeg as a separate cancellable process using `spawn` and `shell: false`.
4. Extract only the first audio stream with `-map 0:a:0 -vn`; remove source metadata and chapters; encode with `-c:a libmp3lame -q:a 2 -f mp3`. This is variable-bitrate lossy MP3. No bitrate, sample rate or channel count is invented or forced in the UI.
5. Check that the output is a regular non-empty file within the size limit. FFprobe must identify one MP3 audio stream and an MP3 container within the duration limit. Remove the intermediate video.
6. Serve `audio/mpeg` with a bounded, sanitized creator/title `.mp3` attachment filename, `private, no-store`, `nosniff`, and the existing short-lived file token. No server path is returned.

The job-wide timeout covers retrieval and conversion. Existing size monitoring, rate limits and concurrency limits remain active through conversion. Cancellation, timeout, failure and shutdown abort the running process and remove the verified job directory. Successful delivery removes temporary data; undelivered files expire through the existing sweep. Browser event-stream disconnects cancel active jobs.

Downloading audio grants no ownership, redistribution rights or commercial-use permission. Audio quality depends on the source. The updated Terms and Responsible Use pages remain operational drafts: the site owner should have them reviewed for the applicable jurisdiction before commercial launch.

## Verification

Final verification: lint and typecheck passed; 188 unit tests, 79 integration tests and 20 Chrome browser tests passed; the production build passed. Real offline conversion produced a 10,865-byte MP3 that passed FFprobe validation and full FFmpeg decoding. No live TikTok calls were used for automated tests.

- Unit coverage: format defaults, preserved MP4 selection, capability gating, panel behavior and safe filenames.
- Integration coverage: MP3 requests, allowlists, URL restrictions, fixed encoder arguments, output verification and headers, authorization, single-use delivery, cancellation, timeout, shutdown and cleanup. Processes are mocked; tests never contact TikTok.
- `npx tsx scripts/verify-mp3.ts` creates a two-second synthetic tone in a local MP4, runs the production MP3 conversion/verification functions, fully decodes the resulting MP3 with FFmpeg, and removes its temporary files. Results are in `MP3_SMOKE_RESULT.json`.
- Browser captures are in `docs/screenshots/mp3-{390,768,1440}-{mp4,selected,preparing,converting,completed,error,unavailable}.png`, using 390 × 844, 768 × 1024 and 1440 × 1000 viewports. Browser fixture values are test-only and never appear as production data.

## Files

Backend: `src/api/contracts.ts`, `src/routes/api.ts`, `src/server.ts`, `src/services/{downloader,memory-store,mp3,tool-check,yt-dlp}.ts`.

Frontend: `views/partials/result-card.ejs`, `src/frontend/{contracts,api-adapter,state-machine,downloader}.ts`, `src/styles/_audio.scss`, and `src/styles/app.scss` plus compiled local assets.

Content and verification: `src/data/legal-pages.ts`, `scripts/verify-mp3.ts`, MP3 unit/integration/browser tests and this document.

Existing browser assertions now target the semantic MP4 radio control. Regression captures use a separate filename prefix to avoid Windows locks on prior preview images. The image build skips writes when generated bytes are unchanged, preserving deterministic output while avoiding the same locks.

## Limits

Audio currently comes from a supported single-file public MP4 containing audio, rather than a separate audio-only extractor format. It does not enable additional post types or private content. Startup capability checks can detect missing tools/encoder but cannot guarantee that every upstream source will convert successfully. Jobs remain in memory on one server, and restarting loses outstanding jobs. The offline smoke test verifies actual encoding/playability; it does not prove live TikTok availability or grant content rights.
