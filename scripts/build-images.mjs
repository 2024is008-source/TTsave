import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const source = new URL('../src/artwork/', import.meta.url);
const output = new URL('../public/assets/images/', import.meta.url);
await mkdir(output, { recursive: true });

const assets = [
  ['preview-unavailable', 1080, 1920, 540],
  ['hero-video-poster', 1080, 1920, 540],
  ['hero-avatar', 256, 256, 128],
  ['video-card', 800, 600, 400],
  ['available-quality', 800, 600, 400],
  ['mobile-friendly', 800, 600, 400],
  ['copy-link-step', 800, 600, 400],
  ['paste-link-step', 800, 600, 400],
  ['download-video-step', 800, 600, 400],
  ['og-image', 1200, 630, 600],
  ['showcase-left', 800, 1200, 400],
  ['showcase-right', 800, 1200, 400],
  ['moment-nature', 600, 800, 300],
  ['moment-city', 600, 800, 300],
];

let built = 0;
for (const [name, width, height, smallWidth] of assets) {
  // Prefer .jpg > .png > .svg as source
  const extensions = ['jpg', 'jpeg', 'png', 'svg'];
  let inputPath = null;
  for (const ext of extensions) {
    const candidate = fileURLToPath(new URL(`${name}.${ext}`, source));
    if (existsSync(candidate)) {
      inputPath = candidate;
      break;
    }
  }
  if (!inputPath) {
    console.warn(`No source found for ${name}, skipping.`);
    continue;
  }

  for (const size of [width, smallWidth]) {
    const destination = new URL(
      `${name}${size === width ? '' : `-${size}`}.webp`,
      output,
    );
    const encoded = await sharp(inputPath)
      .resize(size, Math.round((height / width) * size), {
        fit: 'cover',
        position: 'center',
      })
      .webp({ quality: 87, effort: 5 })
      .toBuffer();
    await writeFile(fileURLToPath(destination), encoded);
    built++;
  }
}

console.log(
  `Built ${String(built)} image variants from ${String(assets.length)} sources.`,
);

const socialOutput = new URL('../public/assets/og/', import.meta.url);
await mkdir(socialOutput, { recursive: true });
const socialCard = await sharp(fileURLToPath(new URL('og-image.svg', source)))
  .resize(1200, 630)
  .jpeg({ quality: 85, mozjpeg: true })
  .toBuffer();
await writeFile(
  fileURLToPath(new URL('tiksavemp4-social-card.jpg', socialOutput)),
  socialCard,
);
