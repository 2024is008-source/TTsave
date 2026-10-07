# TTSave

Node.js 24, strict TypeScript, Express and EJS. The current interface is a preview;
the versioned API uses an explicitly labelled in-memory mock. Real TikTok analysis
and file downloading are not implemented.

## Run locally

Install dependencies with `npm ci`, copy `.env.example` to `.env` if you want to
override defaults, then run `npm run build` and `npm run dev`. Open
`http://127.0.0.1:3000`. Run `npm run css:watch` when editing Sass and
`npm run frontend:watch` when editing the downloader modules. Production uses
`npm run build` followed by `npm start`.

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
  `src/services/mock-downloader.ts` owns bounded, expiring in-memory analysis
  fixtures, jobs and cancellation events. See `docs/API.md` for endpoints and
  errors. It performs no network resolution or downloads; syntax validation does
  not establish whether a post is public.

## Verification

`npm run check` runs lint, typecheck, service and route tests, and the production
build. `npm run format:check` checks formatting.

After building, `npm run test:ui` uses locally installed Google Chrome through
Playwright. It verifies 390px, 768px, 1024px and 1440px layouts, light and dark
themes, horizontal overflow, local artwork, mobile navigation, FAQ expansion,
validation feedback, keyboard format selection, download cancellation, progress,
browser handoff and theme persistence. Screenshots are written to
the ignored `test-results` directory. Browser tests are separate from Vitest
so basic service checks do not require a browser installation.

The `reference` directory is preserved unchanged as the original design source.
