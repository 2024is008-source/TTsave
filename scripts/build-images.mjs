import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const source = new URL('../src/artwork/', import.meta.url);
const output = new URL('../public/assets/images/', import.meta.url);
await mkdir(output, { recursive: true });

const assets = [
  ['hero-video-poster', 1080, 1920, 540],
  ['hero-avatar', 256, 256, 128],
  ['video-card', 800, 600, 400],
  ['available-quality', 800, 600, 400],
  ['mobile-friendly', 800, 600, 400],
  ['copy-link-step', 800, 600, 400],
  ['paste-link-step', 800, 600, 400],
  ['download-video-step', 800, 600, 400],
  ['og-image', 1200, 630, 600],
];

for (const [name, width, height, smallWidth] of assets) {
  const input = fileURLToPath(new URL(`${name}.svg`, source));
  for (const size of [width, smallWidth]) {
    const destination = new URL(
      `${name}${size === width ? '' : `-${size}`}.webp`,
      output,
    );
    await sharp(input)
      .resize(size, Math.round((height / width) * size))
      .webp({ quality: 86, effort: 5 })
      .toFile(fileURLToPath(destination));
  }
}

console.log('Built 9 original illustrations and their responsive WebP variants.');
