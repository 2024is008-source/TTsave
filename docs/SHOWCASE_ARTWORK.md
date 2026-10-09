# Lower-page visual redesign

The supplied second screenshot guides the composition: compact glass feature
cards, circular icon wells, three numbered steps, horizontal image cards,
pearlescent edge artwork and a smaller final call to action. Copy describes the
implemented public-video workflow. Unsupported photo/slideshow support,
watermark guarantees, speed promises, resolutions and invented usage statistics
are not carried over.

## Local assets

Generated with the built-in imagegen tool. These are AI-created decorative
concept images, not analyzed media, user avatars or customer endorsements.

| Source                           | Delivered WebP dimensions | Smaller variant | Purpose                                               |
| -------------------------------- | ------------------------- | --------------- | ----------------------------------------------------- |
| `src/artwork/showcase-left.png`  | 800 × 1200                | 400 × 600       | Transparent ribbon, music tile and travel frame       |
| `src/artwork/showcase-right.png` | 800 × 1200                | 400 × 600       | Transparent ribbon, download tile and mountain frames |
| `src/artwork/moment-nature.png`  | 600 × 800                 | 300 × 400       | Alpine travel illustration                            |
| `src/artwork/moment-city.png`    | 600 × 800                 | 300 × 400       | Adult city creator illustration                       |

The build manifest compiles them to `public/assets/images`. The existing local
hero poster supplies the first moment card. All use `picture`, WebP `srcset`,
explicit dimensions and lazy loading. Edge decorations have empty alternative
text, are hidden from accessibility APIs and cannot receive pointer input.
Below 1250px the edge artwork is hidden to preserve content space. Mobile cards
and steps reflow rather than shrinking the desktop composition. Artwork is
static and respects reduced motion.

## Generation prompts

### showcase-left

Create a premium polished 3D decorative artwork asset for TikSaveMp4, a luminous
Apple-inspired creator-video website. Tall portrait composition, transparent
background, isolated objects, no background panel. A wide flowing pearlescent
satin glass ribbon makes two loose elegant loops vertically, with beautiful
pastel pink, lavender and icy cyan iridescent refractions, realistic studio soft
lighting. In upper loop floats a glossy rounded black square music-note tile
with simple white musical note accented cyan and pink. In lower loop floats one
tilted rounded white photo frame containing a photorealistic adult female travel
creator in black casual outfit at a golden-hour seaside sunset, face clearly
visible, no interface, no words. Two tiny pearlescent spheres only. Luxurious
product-render craftsmanship, smooth bevels, soft contact shadows, airy
composition with generous transparent space between upper tile and lower photo.
Objects entirely inside canvas, no cropping, no text, no lettering, no statistics,
no website screenshots. This will be displayed as noninteractive decoration
along the far left edge of a website; tall 2:3 composition.

### showcase-right

Premium 3D product-render decorative artwork for luminous Apple-inspired TikSaveMp4
website, tall portrait 2:3 composition, fully transparent background. Isolated
opalescent ribbon sculpture making two airy flowing loops vertically;
translucent pearl glass ribbon glowing icy blue, lavender and soft blush pink at
edges. Upper loop cradles tilted white ceramic rounded-square tile with a clean
embossed violet downward arrow entering a tray. Lower loop surrounds two gently
fanned rounded white photo frames containing photoreal snowcapped alpine
mountains, teal lake, lavender-pink sunrise. One small iridescent sphere.
Physically realistic smooth bevels, beautiful specular highlights, soft shadows,
refined cinematic studio lighting, ample transparent breathing room.
Complementary right-edge decoration for a website, every object fully contained,
no cropping, no text, no letters, no UI screenshots, no statistics. Extremely
polished elegant high-quality editorial render.

### moment-nature

Photorealistic premium travel editorial photograph, portrait 3:4 crop. A serene
turquoise alpine lake reflecting rugged snowy mountains at sunrise, soft blush
pink clouds and pale violet sky, dark evergreen trees at edge, realistic
crystalline water, exquisite natural details, warm sunlight hitting peak.
Luxurious travel creator video still, atmospheric but realistic, blue/pink
palette complementary to a premium Apple-inspired website. No people, no text,
no interface, no frames, no watermark. Fill canvas.

### moment-city

Photorealistic lifestyle travel editorial photograph portrait 3:4. Stylish adult
woman age 28 in casual cream jacket, seen in three-quarter profile looking toward
a vibrant Tokyo street at blue hour, natural face, realistic hands, softly glowing
magenta and electric-blue city lights and warm lanterns in background, cinematic
shallow depth of field, subtle film texture, candid believable creator-video
still, premium editorial photography with luminous pink/cyan/violet palette. No
readable signage, no text, no interface, no frame, no watermark. Fill canvas,
person in middle with space around face.

## Verification

Run `npm run check` and `npm run test:ui`. Browser checks cover 390, 768, 1024 and
1440px in both themes, local responsive image loading, card bounds, navigation,
FAQ, form validation and analyzed-result behavior. Lower-page captures are saved
in `docs/screenshots/showcase-{light,dark}-{width}.png` for visual review.
