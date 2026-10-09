import { expect, it } from 'vitest';
import { normalizePhotoPage } from '../src/services/photo-metadata.js';
const url = 'https://www.tiktok.com/@creator/photo/123';
const image = (index: number) => ({
  imageURL: {
    urlList: [`https://p16.tiktokcdn.com/${String(index)}.webp?signature=secret`],
  },
});
function page(images: unknown[], overrides: object = {}) {
  return `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ __DEFAULT_SCOPE__: { 'webapp.video-detail': { statusCode: 0, itemInfo: { itemStruct: { id: '123', desc: 'Photo title', author: { uniqueId: 'creator' }, imagePost: { images }, ...overrides } } } } })}</script>`;
}
it('normalizes ordered private sources, caps count, deduplicates and creates opaque IDs', () => {
  const source = normalizePhotoPage(
    page(Array.from({ length: 35 }, (_, i) => image(i + 1))),
    url,
  );
  expect(source.media.postType).toBe('photo');
  expect(source.media.formats).toEqual([]);
  expect(source.media.capabilities).toEqual({ images: true, mp4: false, mp3: false });
  expect(source.photoSources?.size).toBe(35);
  expect(
    [...(source.photoSources?.values() ?? [])].map((photo) => photo.position),
  ).toEqual(Array.from({ length: 35 }, (_, i) => i + 1));
  expect([...(source.photoSources?.keys() ?? [])][0]).toMatch(/^[a-f0-9-]{36}$/);
  expect(JSON.stringify(source.media)).not.toMatch(/signature|cookie|imageURL|urlList/);
  expect(normalizePhotoPage(page([image(1), image(1)]), url).photoSources?.size).toBe(1);
  expect(() =>
    normalizePhotoPage(page(Array.from({ length: 36 }, (_, i) => image(i))), url),
  ).toThrow();
});
it('detects verified image metadata even when a public post uses a video path', () => {
  expect(
    normalizePhotoPage(page([image(1)]), url.replace('/photo/', '/video/')).media
      .postType,
  ).toBe('photo');
});
it.each([
  page([]),
  page([image(1)], { privateItem: true }),
  page([image(1)], { forFriend: true }),
  page([image(1)], { id: '999' }),
  page([{ imageURL: { urlList: ['https://evil.example/image'] } }]),
  'invalid',
  'x'.repeat(2 * 1024 * 1024 + 1),
])(
  'fails closed for malformed, restricted, mismatched, empty or excessive metadata',
  (html) => {
    expect(() => normalizePhotoPage(html, url)).toThrow('No supported images');
  },
);
