# Blog cover, presentation order and typography

Owner-requested update, October 20, 2026. No commit, push or deployment performed.

## Result

- Added original generated photo/ZIP cover artwork for the image-download guide. Master PNG and both WebP variants are local. See [IMAGE_BLOG_COVER.md](IMAGE_BLOG_COVER.md) for the exact built-in imagegen prompt, provenance and paths.
- Homepage preview now presents MP4 → MP3 → Images. The complete listing starts in the same order, with PC next. `featuredBlogSlugs` in `src/data/blog-posts.ts` owns this presentation choice; no publication timestamps were changed to force an order. Only published records can be featured, and other posts retain newest-first fallback order. Listing schema matches visible ordering; sitemap URL order/inclusion is unchanged.
- Cards use equal 16:9 covers, consistent padding, a shared three-line title space and bottom-aligned Read guide links. Following the owner's taller-card reference, full preview paragraphs are visible without line clamping. Equal grid rows size every card to the tallest content at that screen width, including the PC card on the next row and stacked mobile cards. Heights adapt to text and viewport size rather than clipping content into a fixed pixel height. Complete article text is unchanged.
- Card summaries are 16px, metadata 14px, and titles scale from 18px to 20.8px. Article paragraphs scale between 16px and 18px with 1.8 line height; the reading column is at most 760px. H1/H2/H3 sizes and spacing have been adjusted consistently without changing heading text. Mobile cards stack; tablet uses two columns; desktop uses three.
- The stylesheet version changed to `blog-3` so existing visitors receive the local compiled CSS update. Theme colors, reduced-motion behavior and keyboard focus protections remain in place.

The image guide retains its original title, description, wording and publication date. Its approved cover is now consistently included in the article, cards, OG/Twitter and BlogPosting. The image-free rendering fallback remains available and tested for other records without covers. Earlier publication reports describe their historical state; this report and BLOG.md describe the current presentation.

## Files

Created:

- `src/artwork/tiktok-images-guide.png`
- `public/assets/images/tiktok-images-guide.webp` (1600 × 900)
- `public/assets/images/tiktok-images-guide-800.webp` (800 × 450)
- `tests/browser/blog-layout.spec.ts`
- `docs/IMAGE_BLOG_COVER.md`
- `docs/BLOG_REFINEMENT.md`

Modified:

- `src/data/blog/how-to-download-tiktok-images.ts`: add the approved cover only; update source comment.
- `scripts/build-images.mjs`: compile the new artwork through the existing Sharp pipeline.
- `src/data/blog-posts.ts`, `src/routes/public.ts`: feature the requested guides in the preview/listing and matching listing schema.
- `src/styles/_blog.scss`, generated `public/assets/app.css`: card alignment, excerpt preview layout and readable article typography.
- `views/partials/head.ejs`: stylesheet cache version only.
- `tests/e2e/first-blog-article.test.ts`, `tests/e2e/fourth-blog-article.test.ts`: assert the requested preview order while retaining article discovery coverage.
- `tests/e2e/third-blog-article.test.ts`: verify the real cover and its matching metadata/delivery.
- `tests/e2e/blog.test.ts`: preserve explicit coverage for image-free records.
- `tests/browser/blog.spec.ts`: expected featured listing order.
- `tests/browser/first-blog-article.spec.ts`, `tests/browser/fourth-blog-article.spec.ts`: exercise the updated preview/listing navigation.
- `tests/browser/third-blog-article.spec.ts`: check the new cover.
- `docs/BLOG.md`: current featured-order workflow.

No downloader source/API, analytics attribution, AdSense settings, homepage SEO title/description, canonical URL or article prose was edited. The new cover's main WebP is 150,686 bytes; the 800px variant is 57,406 bytes, measured from the generated files.

## Review after an authorized release

Check fresh CSS caching, local cover delivery, the featured order and typography on real phones and desktop browsers. Public deployment and Google processing are not performed by local tests. The generated image is conceptual artwork, with no invented photographer or stock-photo attribution.

## Final validation — October 20, 2026

- `npm run check` passed ESLint, strict typechecking, all 403 unit tests, all 167 integration tests and the production build. Build validation confirmed four published articles and four supplied WebP covers.
- All 63 selected Chrome tests passed in the final run after the taller-card update (3.5 minutes). Command: `npm run test:ui -- tests/browser/blog-layout.spec.ts tests/browser/first-blog-article.spec.ts tests/browser/second-blog-article.spec.ts tests/browser/third-blog-article.spec.ts tests/browser/fourth-blog-article.spec.ts tests/browser/blog.spec.ts tests/browser/seo.spec.ts tests/browser/analytics.spec.ts tests/browser/download-api.spec.ts tests/browser/downloader.spec.ts tests/browser/mp3.spec.ts tests/browser/photos.spec.ts tests/browser/photo-selection.spec.ts --timeout=60000`.
- New layout tests measure every card, including later rows, at 390, 768, 1024 and 1440 pixels: equal heights within two pixels, aligned title/paragraph/link positions within each row, full untruncated preview text, decoded local covers, and the requested order. Every article's actual paragraph font is 16–18px with at least 1.7 line-height ratio, a reading width of at most 760px, one H1 and no horizontal overflow.
- Existing checks cover light/dark themes, accessibility, keyboard/mobile navigation, reading without JavaScript, exact article text/SEO/canonical/schema, sitemap and query indexing behavior, analytics attribution and downloader MP4/MP3/photo/ZIP flows. The real image cover is verified in its article and metadata; a separate fixture test retains the image-free fallback. An earlier assertion expecting MP4 to be excluded from the homepage was updated to the owner's requested featured order; no test was removed or skipped.
- Generated artwork, the completed desktop listing and an actual 390px mobile photo card were visually inspected. Layout screenshots are under `test-results/`; the standalone mobile capture is `test-results/photo-card-390.png`. Other test evidence uses the existing `docs/screenshots/browser-*/` path.
- `git diff --check` passed. No commit, push, deployment, downloader/API change or analytics configuration change occurred.
