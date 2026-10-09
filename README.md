# TikSaveMp4

Node.js 24, strict TypeScript, Express and EJS. Public TikTok metadata analysis
and single-server MP4/MP3 download jobs use yt-dlp and FFmpeg. Supported public photo posts provide individual images or a ZIP of selected images. Jobs are held in memory and files
are temporary. See `docs/DOWNLOAD_JOBS.md` for deployment limits and cleanup.

## Run locally

Install dependencies with `npm ci`, copy `.env.example` to `.env` if you want to
override defaults, then run `npm run build` and `npm run dev`. Open
`http://127.0.0.1:3000`. Run `npm run css:watch` when editing Sass and
`npm run frontend:watch` when editing the downloader modules. Production uses
`npm run build` followed by `npm start`.

Production requires `NODE_ENV=production` and explicit
`PUBLIC_BASE_URL=https://tiksavemp4.online`. Set `LEGAL_CONTACT_EMAIL` to a real
monitored legal inbox before launch. Review the operational legal drafts and
configure DNS, TLS and domain redirects as described in
[`docs/PRODUCTION_SEO.md`](docs/PRODUCTION_SEO.md).

Install yt-dlp, FFmpeg/FFprobe and Chrome independently, then configure `YTDLP_PATH` and
`FFMPEG_PATH` and `FFPROBE_PATH` as approved tool names on PATH or local absolute executable paths.
Run `npm run tools:check` to verify them. Startup performs the same bounded checks;
`/ready` returns 503 if a required tool is missing. See `docs/ANALYSIS.md` for limits,
format eligibility and operation details.

Photo downloads use verified JPEG, PNG or WebP bytes through the protected network layer. At most 35 photos, 12 MiB per image and 64 MiB combined are supported. A single selection downloads the image; two or more produce one ordered ZIP. See [docs/COMMAND17.md](docs/COMMAND17.md) for the current photo architecture, verification and remaining production checks. No private-post, login, cookie or regional bypass is supported.

## Interface structure

- `views/index.ejs` composes the partials in `views/partials`.
- `src/styles/app.scss` compiles the token, layout, hero and section styles into
  `public/assets/app.css`.
- `src/frontend` contains the typed downloader state machine, Zod contracts,
  DOM controller and API adapter. esbuild compiles these into the
  browser module in `public/assets/js`, alongside theme and navigation modules.
  No inline application scripts or handlers are used.
- `src/artwork` holds original SVG placeholders. `npm run images:build` compiles
  all nine assets and responsive variants into `public/assets/images`. The
  smartphone is explicitly labelled as an illustrated lifestyle preview with a
  fictional adult concept creator, and has no engagement counts. See
  `docs/IMAGE_REQUIREMENTS.md` for final licensed-photo requirements.
- `src/data/mock-data.ts` holds temporary server-rendered copy. Result and
  progress data remain `null`; hidden result and progress containers are populated
  only from validated adapter responses. Never substitute invented media metadata.
- `src/api/contracts.ts` defines versioned request and response schemas.
  `src/services/yt-dlp.ts` extracts and normalizes public source metadata.
  `src/services/downloader.ts` owns bounded, expiring analyses and real jobs;
  `src/services/memory-store.ts` defines the service contract and test store.
  Mock metadata lives exclusively in `tests/fixtures`. See `docs/API.md`
  for endpoints and errors. URL syntax alone does not establish public availability.

## Verification

`npm run check` runs lint, typecheck, service and route tests, and the production
build. `npm run format:check` checks formatting.
Child processes are mocked in automated analysis and download tests; tests never
depend on live TikTok. Browser tests intercept API requests with contract fixtures.

After building, `npm run test:ui` uses locally installed Google Chrome through
Playwright. It verifies 390px, 768px, 1024px and 1440px layouts, light and dark
themes, horizontal overflow, local artwork, mobile navigation, FAQ expansion,
validation feedback, keyboard format selection, download cancellation, progress,
browser handoff and theme persistence. Screenshots are written to
the ignored `test-results` directory. Browser tests are separate from Vitest
so basic service checks do not require a browser installation.

The `reference` directory is preserved unchanged as the original design source.
