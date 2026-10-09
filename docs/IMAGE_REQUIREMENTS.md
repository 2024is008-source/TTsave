# TikSaveMp4 image audit and replacement requirements

## Current asset status

All imagery served by the application is local. No Google-hosted or other
external image URLs are used by the EJS templates, styles or browser modules.
The original `reference/code.html` contains historical Google image URLs and is
preserved unchanged under the repository rule prohibiting reference edits. It
is never served by Express.

Licensed final photographs and model releases were not supplied. The current
assets are original SVG illustrations created for this repository, compiled to
WebP by Sharp. They are placeholders, not photographs or resolved TikTok media.
No third-party image was downloaded or hotlinked. The adult creator, Maya, is a
fictional concept character; the preview label and caption distinguish the
artwork from backend video results. Do not infer metadata or available formats
from any decorative artwork.

## Required dimensions

All paths below are relative to `public/assets/images`. Master SVG sources have
matching names under `src/artwork`. All measurements are pixels; preserve the
aspect ratio when supplying replacements.

| Local WebP path            | Exact master dimensions | Responsive variant                        | Required replacement content                                                                                                                                    |
| -------------------------- | ----------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hero-video-poster.webp`   | 1080 × 1920 (9:16)      | `hero-video-poster-540.webp`, 540 × 960   | Adult travel or lifestyle creator in a believable vertical video still, coastal or travel setting, natural light, no website screenshots or baked-in interface. |
| `hero-avatar.webp`         | 256 × 256 (1:1)         | `hero-avatar-128.webp`, 128 × 128         | Matching adult creator portrait; face centred with a circular-crop safe margin.                                                                                 |
| `video-card.webp`          | 800 × 600 (4:3)         | `video-card-400.webp`, 400 × 300          | A distinct coastal travel moment, without a website screenshot or fabricated metadata.                                                                          |
| `available-quality.webp`   | 800 × 600 (4:3)         | `available-quality-400.webp`, 400 × 300   | Source-detail concept illustration; no resolution promises, enhancement labels or invented file sizes.                                                          |
| `mobile-friendly.webp`     | 800 × 600 (4:3)         | `mobile-friendly-400.webp`, 400 × 300     | Coordinated phone and desktop illustration with a distinct scene.                                                                                               |
| `copy-link-step.webp`      | 800 × 600 (4:3)         | `copy-link-step-400.webp`, 400 × 300      | Copy/share-link concept illustration.                                                                                                                           |
| `paste-link-step.webp`     | 800 × 600 (4:3)         | `paste-link-step-400.webp`, 400 × 300     | Clipboard and link-entry concept illustration.                                                                                                                  |
| `download-video-step.webp` | 800 × 600 (4:3)         | `download-video-step-400.webp`, 400 × 300 | Video-file concept illustration, no completion or download-progress numbers. This illustrates a future workflow, not an implemented download.                   |
| `og-image.webp`            | 1200 × 630              | `og-image-600.webp`, 600 × 315            | TikSaveMp4 branding, concise headline and interface-preview label; keep text inside a 60px safe margin.                                                         |

## Poster composition and rights

- Use an adult subject with a documented model release and rights covering
  commercial web display and social previews. Record the source, photographer,
  licence and permitted edits before replacing the illustration. Do not use a
  scraped creator image or imply a real creator endorses TikSaveMp4.
- Place the face within x=350–600, y=430–690 in the 1080 × 1920 master. Keep the
  top 280px, rightmost 180px below y=700, and bottom 440px free of facial detail
  and essential scene content. These areas accommodate camera, navigation,
  action icons and caption overlays.
- Keep the subject and setting separate from interface overlays. The thin
  bezel, silver frame, dynamic-island camera, side buttons, shadows and
  pearlescent pedestal are CSS artwork. They are not baked into the poster.
- The social interface has no counts and no interactive controls. Update the
  creator name and caption only with verified content or retain the explicit
  concept-artwork label.
- Feature and step images use a central 2:1 crop on small phones. Keep essential
  visual content within y=100–500 of each 800 × 600 master. They are decorative;
  section titles and explanatory text remain real HTML outside the images.

## Delivery and responsive rendering

`npm run images:build` rebuilds the full-size and smaller WebP assets;
`npm run build` runs this automatically. Commit the source SVGs and generated
WebPs together. Replace sources and update the build manifest if final licensed
raster originals are introduced. The script uses fixed project paths, never
user-selected paths.

The reusable `picture.ejs` partial emits WebP `source` elements with `srcset` and
`sizes`, explicit intrinsic width and height, asynchronous decoding and loading
priority. The hero poster is eager; below-fold card and step illustrations are
lazy. The avatar is eager at its small display size. Images load without a
third-party image service. Before publication, make the Open Graph image URL
absolute using the verified deployment origin so social crawlers can fetch it.

The composition contains one information card, one download badge marked
“Coming later,” one music tile, one iridescent ribbon and two decorative spheres.
These sit behind or below the phone, cannot receive focus or clicks, and never
overlap the link-entry controls, the subject's face or the phone caption.

## Checks

The lower landing-page redesign replaces the displayed flat feature/step images
with compact HTML/SVG icon cards and four new generated raster assets. See
[SHOWCASE_ARTWORK.md](SHOWCASE_ARTWORK.md) for current dimensions, source paths,
generation prompts and responsive placement. Legacy feature/step assets remain
available but are no longer rendered by these sections.

Run `npm run format:check`, `npm run check`, and `npm run test:ui`. Browser tests
cover all four requested widths in both themes, image decoding and local paths,
responsive source attributes, dimensions, noninteractive decorative elements,
navigation, form feedback and horizontal overflow. Inspect the screenshots in
`test-results` to confirm face placement, clipping and composition.
