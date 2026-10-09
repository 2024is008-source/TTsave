import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '../middleware/error-handler.js';
import { tiktokUrlSchema } from '../shared/video-url.js';
import { publicFetch } from './public-fetch.js';
import { remoteImageSchema } from './photo-images.js';
import type { AnalyzedSource } from './yt-dlp.js';

export const MAX_PHOTOS = 35;
const itemSchema = z.object({
  id: z.string().regex(/^\d+$/),
  desc: z.string().max(20_000),
  privateItem: z.boolean().optional(),
  forFriend: z.boolean().optional(),
  author: z.object({ uniqueId: z.string().max(200) }),
  imagePost: z.object({
    images: z
      .array(
        z.object({
          imageURL: z.object({ urlList: z.array(z.string().max(4096)).max(10) }),
        }),
      )
      .max(1000),
  }),
});
const unsupported = () =>
  new HttpError(
    422,
    'PHOTO_UNSUPPORTED',
    'No supported images are available for this public post. Private and restricted posts are unsupported.',
  );

/** Read public hydration data only; no scripts, challenges, cookies or API impersonation. */
export function normalizePhotoPage(html: string, sourceUrl: string): AnalyzedSource {
  if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw unsupported();
  const id = /\/(?:photo|video)\/(\d+)/.exec(new URL(sourceUrl).pathname)?.[1];
  let payload: unknown;
  for (const script of html.matchAll(
    /<script\b[^>]*\bid=["'](?:__UNIVERSAL_DATA_FOR_REHYDRATION__|SIGI_STATE|sigi-persisted-data)["'][^>]*>([\s\S]*?)<\/script\s*>/gi,
  )) {
    try {
      const root: unknown = JSON.parse(script[1] ?? '');
      const universal = z
        .object({
          __DEFAULT_SCOPE__: z.object({
            'webapp.video-detail': z.object({
              statusCode: z.literal(0),
              itemInfo: z.object({ itemStruct: z.unknown() }),
            }),
          }),
        })
        .safeParse(root);
      if (universal.success)
        payload =
          universal.data.__DEFAULT_SCOPE__['webapp.video-detail'].itemInfo.itemStruct;
      else {
        const sigi = z
          .object({ ItemModule: z.record(z.string(), z.unknown()) })
          .safeParse(root);
        if (sigi.success && id) payload = sigi.data.ItemModule[id];
      }
      if (payload) break;
    } catch {
      /* Unsupported public metadata is rejected below. */
    }
  }
  const parsed = itemSchema.safeParse(payload);
  if (
    !parsed.success ||
    parsed.data.id !== id ||
    parsed.data.privateItem ||
    parsed.data.forFriend
  )
    throw unsupported();
  const photoSources = new Map<string, { url: string; position: number }>();
  const unique = new Set<string>();
  for (const image of parsed.data.imagePost.images) {
    const url = image.imageURL.urlList.find(
      (candidate) => remoteImageSchema.safeParse(candidate).success,
    );
    if (!url || unique.has(url)) continue;
    unique.add(url);
    photoSources.set(randomUUID(), { url, position: photoSources.size + 1 });
    if (photoSources.size === MAX_PHOTOS) break;
  }
  if (!photoSources.size) throw unsupported();
  return {
    selectors: new Map(),
    photoSources,
    media: {
      id: randomUUID(),
      postType: 'photo',
      title: parsed.data.desc.trim().slice(0, 500) || 'TikTok photo post',
      creator: parsed.data.author.uniqueId,
      sourceUrl,
      durationSeconds: null,
      thumbnail: null,
      formats: [],
      mock: false,
      downloadAvailable: false,
      capabilities: { mp4: false, mp3: false, images: true },
    },
  };
}

export async function analyzePhoto(url: string, signal: AbortSignal, budgetMs: number) {
  const total = Math.min(8000, Math.max(1, Math.floor(budgetMs)));
  const started = performance.now();
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(total)]);
  const pages = new URL(url).pathname.includes('/photo/')
    ? [url, url.replace('/photo/', '/video/')]
    : [url];
  for (const destination of pages) {
    bounded.throwIfAborted();
    try {
      const page = await publicFetch(
        destination,
        tiktokUrlSchema,
        bounded,
        2 * 1024 * 1024,
        'text/html',
        total - (performance.now() - started),
      );
      if (page.contentType !== 'text/html') throw unsupported();
      // Only the exact submitted post ID is accepted, including the public
      // video-detail representation used by some TikTok photo pages.
      return normalizePhotoPage(page.bytes.toString('utf8'), url);
    } catch {
      bounded.throwIfAborted();
    }
  }
  throw unsupported();
}
