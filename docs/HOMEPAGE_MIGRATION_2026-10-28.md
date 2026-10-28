# Owner's newer TikSaveMP4 UI migrated into Express

## Source comparison and decision

Local inspection confirmed port 3000 served the Express phone/gradient homepage;
port 3103 served the owner's newer white TikTok design. The newer UI is in the
separate Next.js checkout, but Next.js is not the intended production architecture.
The owner explicitly authorized this visual migration, superseding prior requests
to preserve the old Express homepage design. Next.js source remains read-only.

| Old Express homepage source                      | Role                                                    |
| ------------------------------------------------ | ------------------------------------------------------- |
| `views/index.ejs`                                | Old section composition, phone and showcase decorations |
| `views/partials/hero.ejs`                        | Gradient H1, large idle smartphone and result shell     |
| `views/partials/downloader.ejs`                  | Existing form/control hooks and API action              |
| `src/styles/_hero.scss`, `_hero-visibility.scss` | Phone geometry and two-column landing layout            |
| `src/styles/_showcase.scss`, `_tokens.scss`      | Glass panels, gradients and ornamental sections         |
| `src/artwork/`, `public/assets/images/`          | Local artwork, previews and blog images                 |

The newer reference files are all in `D:\My Project\Tiksave`:

| Newer design source                                                                | Role                                                                                            |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/app/page.tsx`                                                                 | Selects the new homepage markup                                                                 |
| `src/ui/saveframe.json`                                                            | Centered heading, Photo/Video tabs, downloader card, navigation, steps/features/FAQ/footer HTML |
| `src/lib/tiktok-page.ts`                                                           | TikTok headings and presentation text                                                           |
| `src/app/tiktok-theme.css`                                                         | White/cyan/pink palette, black 3px border, responsive controls                                  |
| `src/app/globals.css`, `tailwind.config.js`                                        | Reference spacing, utilities and interaction styling                                            |
| `src/ui/fonts.css`, `src/app/fonts/tiktok-sans-latin.woff2`, `tiktok-sans-OFL.txt` | Local font and its SIL Open Font License                                                        |
| `src/components/SaveFrameReference.tsx`                                            | Next/React wrapper, inspected but **not copied**                                                |

## Express implementation

- `views/index.ejs`, `views/partials/hero.ejs`: centered white home, real Photo/Video
  tabs, black-bordered downloader surface and result workspace inside it. No
  decorative phone or fabricated source preview is displayed.
- `views/partials/downloader.ejs`: visual input/action row, existing real Express
  form action and controls retained. Analyzing/cancel/error/completion states remain.
- `views/partials/header.ejs`, `icon.ejs`: TikTok-style brand and homepage navigation;
  real anchor destinations, native tools menu and existing mobile menu behavior.
- `views/partials/home-steps.ejs`, `home-features.ejs`: reference section structure
  adapted to factual Express MP4/MP3/photos/selected-ZIP capabilities.
- `src/styles/_tiksave-home.scss`, `app.scss`: native compiled SCSS port, scoped to
  the homepage. Existing blog, legal and admin layouts/styles remain separate.
- `public/assets/fonts/tiktok-sans-latin.woff2`, `tiktok-sans-OFL.txt`: only copied
  reference assets, with license. No remote fonts, Next runtime or Tailwind CDN.
- `src/frontend/downloader.ts`: tab/keyboard presentation, source-reported media
  auto-selection and busy control protection. Existing controller, adapter, format
  selection, MP3, photo gallery, ZIP, preparation/save and cancellation paths retained.
- `views/partials/head.ejs`, `public/assets/js/app.js`: asset versions changed so
  cached browsers receive the visual update. Metadata generation is preserved.

No Next.js routes, backend, admin, client bundle, dependency or framework package
was copied. Backend/downloader/security/admin/reporting code is unchanged by the
visual migration. GA4 consent/delivery tracking and the default-off Monetag policy
remain. Existing metadata/canonical/sitemap/blog content are preserved. FAQ copy
uses the same server data as structured data, with instructions matching new labels.

Old website artwork was retained because build scripts, historical documentation
and explicit test fixtures still reference it. It is not requested by the new
homepage. The separate artifact cleanup removes only disposable test output,
never website artwork: see [ARTIFACT_CLEANUP_2026-10-28.md](ARTIFACT_CLEANUP_2026-10-28.md).

## Verification

Final checks passed: lint, strict types, production build, formatting, 466 unit
tests, 206 integration tests and all 122 browser tests (9.4 minutes). The browser
suite covers responsive layouts, accessibility, downloads, admin, consent and
SEO/blog preservation. Tests that required the old
decorative smartphone now assert the new layout instead; their format, download,
state, focus, cancellation and accessibility checks remain. New browser cases
exercise keyboard tabs, automatic video recognition, responsive navigation and
the real frontend API adapter's POST contract (controlled response, no fake production
media). Unit/integration tests continue to verify Express delivery lifecycles.

The earlier sanitized real MP4/MP3 results remain in
`docs/release/local-media-verification.json`; they are earlier local verification,
not a new live-source or production run. GitHub publication is separately authorized;
production deployment remains outside this release preparation.
