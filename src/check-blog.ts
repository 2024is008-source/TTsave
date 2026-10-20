import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { blogPosts } from './data/blog-posts.js';
import { createBlogRegistry } from './services/blog.js';

const registry = createBlogRegistry(blogPosts);
let validatedCovers = 0;
for (const post of registry.published) {
  if (!post.cover) continue;
  const image = await sharp(
    path.join(fileURLToPath(new URL('../public/', import.meta.url)), post.cover.src),
  ).metadata();
  if (
    image.format !== 'webp' ||
    image.width !== post.cover.width ||
    image.height !== post.cover.height
  )
    throw new Error(`Blog cover dimensions or format do not match: ${post.slug}`);
  validatedCovers++;
}
console.info(
  `Validated ${String(registry.published.length)} published blog records and ${String(validatedCovers)} supplied cover images.`,
);
