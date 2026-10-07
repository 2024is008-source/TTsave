---
name: Luminous Glass Kinetic
colors:
  surface: '#faf8ff'
  surface-dim: '#d8d9e8'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#ecedfc'
  surface-container-high: '#e6e7f6'
  surface-container-highest: '#e0e1f0'
  on-surface: '#181b26'
  on-surface-variant: '#5d3f40'
  inverse-surface: '#2d303b'
  inverse-on-surface: '#eff0ff'
  outline: '#916e6f'
  outline-variant: '#e6bcbd'
  surface-tint: '#be0036'
  primary: '#ba0035'
  on-primary: '#ffffff'
  primary-container: '#e51146'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb3b6'
  secondary: '#0057c1'
  on-secondary: '#ffffff'
  secondary-container: '#046ef1'
  on-secondary-container: '#fefcff'
  tertiary: '#7814ed'
  on-tertiary: '#ffffff'
  tertiary-container: '#9146ff'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdada'
  primary-fixed-dim: '#ffb3b6'
  on-primary-fixed: '#40000c'
  on-primary-fixed-variant: '#920027'
  secondary-fixed: '#d9e2ff'
  secondary-fixed-dim: '#afc6ff'
  on-secondary-fixed: '#001a43'
  on-secondary-fixed-variant: '#004398'
  tertiary-fixed: '#ecdcff'
  tertiary-fixed-dim: '#d5baff'
  on-tertiary-fixed: '#270057'
  on-tertiary-fixed-variant: '#5e00c1'
  background: '#faf8ff'
  on-background: '#181b26'
  surface-variant: '#e0e1f0'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 64px
    fontWeight: '800'
    lineHeight: 72px
    letterSpacing: -0.035em
  display-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 38px
    fontWeight: '800'
    lineHeight: 44px
    letterSpacing: -0.035em
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 44px
    fontWeight: '800'
    lineHeight: 52px
    letterSpacing: -0.03em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '800'
    lineHeight: 38px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.025em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 30px
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.015em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: -0.005em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 3rem
  margin-mobile: 1.25rem
  space-xs: 0.375rem
  space-sm: 0.75rem
  space-md: 1.25rem
  space-lg: 2rem
  space-xl: 3.5rem
---

## Brand & Style

This design system synthesizes Apple's precision hardware landing page aesthetic with the kinetic, hyper-saturated digital expression of modern creator culture. The brand personality is radiant, effortless, crystalline, and technologically seamless. Designed for modern creators, digital curators, and global mobile-first audiences, the interface treats utility software with high-end luxury hardware craftsmanship.

The visual style blends **Glassmorphism** and **Luminous Minimalism**:
- Translucent, frosted optical planes that catch ambient illumination.
- Luminous chromatic bleeds that soften strict architectural geometry.
- Fluid depth derived from multi-stop vibrant gradients, multi-axis soft glows, and crisp 1px light-refracting edge highlights.
- Visual weight rests entirely on generous whitespace, strict typographic tracking, and physical surface clarity rather than opaque divisions.

## Colors

The color architecture bridges pure optical light and intense saturated neon spectra. Rather than resting on flat primary assignments, key interactions rely on signature multi-stop gradient streams and chromatic ambient glows.

### Chromatic Spectrum
- **Primary Energy (Pink / Red):** `#FE2C55` (with `#FF3FA4` vibrant tint) anchors active triggers, core conversions, and brand emphasis.
- **Electric Blue:** `#287CFF` delivers high-contrast kinetic balance, trust, and fluid UI guidance.
- **Cyber Violet:** `#8A35FF` acts as the chromatic link between pink and blue, establishing iridescent transitions.
- **Pure Cyan:** `#25F4EE` serves as a dynamic accent highlight in lighting halos, glow backdrops, and active micro-states.

### The Signature 4-Stop Gradient
Linear gradient applied across prominent headlines, hero buttons, and download indicators:
`linear-gradient(135deg, #FE2C55 0%, #FF3FA4 32%, #8A35FF 68%, #287CFF 100%)`

### Light Theme Matrix (Default)
- **Base Canvas:** `#F8FAFF` (soft cool-tinted daylight base)
- **Glass Panel Surface:** `rgba(255, 255, 255, 0.72)` with `backdrop-filter: blur(24px)`
- **Glass Panel Border:** `rgba(255, 255, 255, 0.85)` top/left specular rim, fading to `rgba(225, 232, 245, 0.45)`
- **Primary Foreground Text:** `#0D101A` (near-black ink)
- **Secondary Body Text:** `#5D657B` (balanced slate)
- **Subtle / Placeholder Text:** `#9FA8BC`

### Dark Theme Matrix
- **Base Canvas:** `#0D101A`
- **Surface Layer:** `#171C2A`
- **Elevated Glass Surface:** `rgba(32, 38, 56, 0.75)` with `backdrop-filter: blur(24px)`
- **Panel Edge Border:** `rgba(255, 255, 255, 0.12)`
- **Primary Foreground Text:** `#F6F7FC`
- **Secondary Body Text:** `#9FA8BC`

## Typography

The typographic system adheres to Apple's modern presentation style: precise, architectural, and compact. 

- **Tight Tracking:** Headlines and displays use negative tracking (`-0.035em` down to `-0.02em`) to compress letterforms into confident typographic locks.
- **Gradient Fills:** Primary keyword headlines utilize a masked text linear gradient (`#FE2C55` -> `#FF3FA4` -> `#8A35FF` -> `#287CFF`) with `-webkit-background-clip: text` to direct eye focus directly to the value proposition.
- **Optical Hierarchy:** Strict contrast distinction between dark titles (`#0D101A` / 800 weight) and muted supporting subtitles (`#5D657B` / 400 weight).
- **Legibility Balance:** Body copy retains balanced kerning and proportional line-height (1.5x) to maintain effortless parsing against luminous blurred backdrops.

## Layout & Spacing

The layout model is built on an expansive 12-column responsive fluid grid with an Apple-style fixed maximum content container of `1280px`.

- **Desktop (>= 1024px):** 12 columns, `1.5rem` (24px) gutters, and minimum outer margin of `3rem` (48px). Hero layouts feature split columns: 6-column content and search interaction on the left, 6-column floating hardware mockups and stage props on the right.
- **Tablet (768px - 1023px):** 8 columns, `1.25rem` (20px) gutters, outer margin of `2rem` (32px). Secondary cards reflow into 2x2 grids.
- **Mobile (< 768px):** 4 columns, `1rem` (16px) gutters, outer margin of `1.25rem` (20px). Layout stacks vertically into a single column with floating input and pill actions prioritized above the fold.

### Spacing Rhythm
- Section padding ranges between `space-xl` (56px) and 96px to deliver clear visual distinction without rigid divider lines.
- Card interiors consistently maintain `1.5rem` to `2rem` internal padding, maintaining optical balance around floating elements.

## Elevation & Depth

Visual hierarchy uses physical-refraction glass layers and ambient volumetric lighting rather than stark dropshadows.

### Optical Layer Stack
1. **Background Canvas Layer:** Base `#F8FAFF` infused with oversized, hyper-diffused radial orbs:
   - Primary Halo: `radial-gradient(circle at 10% 20%, rgba(37, 244, 238, 0.15) 0%, transparent 40%)`
   - Secondary Halo: `radial-gradient(circle at 90% 40%, rgba(254, 44, 85, 0.12) 0%, transparent 45%)`
   - Ambient Violet Halo: `radial-gradient(circle at 50% 80%, rgba(138, 53, 255, 0.08) 0%, transparent 50%)`
2. **Glass Base Cards:**
   - Background: `rgba(255, 255, 255, 0.76)`
   - Backdrop Filter: `blur(24px) saturate(180%)`
   - Border: `1px solid rgba(255, 255, 255, 0.8)`
   - Shadow: `0 20px 40px -15px rgba(40, 124, 255, 0.07), 0 0 1px 1px rgba(255, 255, 255, 0.9) inset`
3. **Elevated Floating Podiums & Panels:**
   - Background: `rgba(255, 255, 255, 0.92)`
   - Shadow: `0 30px 60px -12px rgba(13, 16, 26, 0.08), 0 12px 24px -8px rgba(254, 44, 85, 0.06)`
   - Edge Glow: Specular inner top highlight `inset 0 1.5px 1px 0 rgba(255, 255, 255, 1)`
4. **Interactive Action Floating State:**
   - On hover, cards subtly translateY by `-4px`, with ambient glow expanding to `0 24px 48px -10px rgba(138, 53, 255, 0.18)`.

## Shapes

The geometry balances smooth curves with Apple-grade continuous squircle aesthetics:

- **Large Glass Cards & Containers:** Standardized radius of `24px` to `28px` (`rounded-xl` equivalent).
- **Search Interaction Capsule:** Full pill-shaped radius (`9999px`) creating an uninterrupted, fluid bar across the canvas.
- **Badges, Filter Chips & Pill Tabs:** Fully rounded pill silhouette (`9999px`), ensuring lightweight, approachable tags.
- **Buttons:** Pill radius (`9999px`) on primary action triggers, and `16px` on secondary utility buttons.
- **Form Controls & Option Tiles:** Radius of `14px` to `16px` (`rounded-lg`).

## Components

### Hero Input Capsule (Paste & Download Field)
- **Container:** Pill-shaped glass container (`height: 64px`) with `rgba(255, 255, 255, 0.85)` background, `1px solid rgba(255, 255, 255, 0.95)`, blur of 20px, and diffused blue-tinted drop shadow (`0 16px 32px -8px rgba(40, 124, 255, 0.12)`).
- **Left Icon:** Subtle link glyph in `#5D657B`.
- **Input Text:** Unbordered transparent input, `#0D101A` text with `#9FA8BC` placeholder.
- **Embedded CTA Button:** Positioned inside the capsule on the right with a 6px offset.

### Buttons
- **Primary Gradient CTA:**
  - Background: Multi-stop linear gradient (`#FE2C55` -> `#8A35FF` -> `#287CFF`).
  - Text: `#FFFFFF`, `label-lg`, with tight letter spacing.
  - Padding: `14px 28px`. Shape: Pill (`9999px`).
  - Hover: Opacity scale with a colored ambient shadow: `0 12px 28px -6px rgba(254, 44, 85, 0.45)`.
- **Secondary Glass Button:**
  - Background: `rgba(255, 255, 255, 0.8)`.
  - Border: `1px solid rgba(225, 232, 245, 0.8)`. Text: `#0D101A`.
- **Icon Action Trigger:**
  - Round pill base with soft tinted background matching the icon's role (e.g., `#FE2C55` with 10% opacity for download arrows).

### Cards & Feature Tiles
- **Feature Glass Card:** `24px` radius, `rgba(255, 255, 255, 0.72)` surface, `1px border rgba(255, 255, 255, 0.85)`. Contains a soft square icon well (`48x48px`, `14px` radius) tinted in light pastel cyan, pink, or purple, followed by a bold title and two-line description.
- **Download Preset / Format Card:**
  - Unselected: `rgba(248, 250, 255, 0.6)` with light border `rgba(225, 232, 245, 0.7)`.
  - Selected: High-contrast purple outline (`#8A35FF`), soft iridescent background glow (`rgba(138, 53, 255, 0.05)`), and saturated badge indicators.

### Badges & Pill Chips
- **Status / Value Badges (e.g., "Free • Fast • No Watermark"):**
  - Pill shape, `padding: 6px 14px`, `label-sm`.
  - Background: `rgba(255, 255, 255, 0.85)` with a faint border `rgba(255, 255, 255, 1)`.
  - Includes a leading micro-icon (e.g., gradient lightning bolt or sparkle).

### Step Indicators
- Circular numbered nodes (`32x32px`) filled with solid bright pink (`#FE2C55`), blue (`#287CFF`), or violet (`#8A35FF`), paired with directional soft chevron glyphs between stages.

### Loading / Analysis Capsule
- Translucent floating card (`rgba(255, 255, 255, 0.95)`), featuring an animated multi-stop gradient spinner and dual-color progress indicator.