import type { BlogPost } from '../services/blog.js';
import { tiktokToMp4Guide } from './blog/how-to-convert-tiktok-to-mp4.js';
import { tiktokToMp3Guide } from './blog/how-to-convert-tiktok-to-mp3.js';
import { tiktokImageGuide } from './blog/how-to-download-tiktok-images.js';
import { tiktokPcGuide } from './blog/how-to-download-tiktok-videos-on-pc.js';

// Only reviewed articles approved for local publication belong in this registry.
export const blogPosts: readonly BlogPost[] = [
  tiktokToMp4Guide,
  tiktokToMp3Guide,
  tiktokImageGuide,
  tiktokPcGuide,
];

// Editorial presentation order; publication dates and sitemap inclusion are unchanged.
export const featuredBlogSlugs: readonly string[] = [
  'how-to-convert-tiktok-to-mp4',
  'how-to-convert-tiktok-to-mp3',
  'how-to-download-tiktok-images',
];
