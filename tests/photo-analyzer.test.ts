import { afterEach, expect, it, vi } from 'vitest';
import { analyzePhoto } from '../src/services/photo-metadata.js';
const fetchPage = vi.hoisted(() => vi.fn());
vi.mock('../src/services/public-fetch.js', () => ({ publicFetch: fetchPage }));
afterEach(() => fetchPage.mockReset());
it('uses a bounded public same-post video-detail fallback and retains the canonical photo source', async () => {
  const url = 'https://www.tiktok.com/@creator/photo/123';
  const html = `<script id="SIGI_STATE">${JSON.stringify({ ItemModule: { '123': { id: '123', desc: 'Photo title', author: { uniqueId: 'creator' }, imagePost: { images: [{ imageURL: { urlList: ['https://p16.tiktokcdn.com/photo'] } }] } } } })}</script>`;
  fetchPage
    .mockResolvedValueOnce({
      bytes: Buffer.from('<html>public shell</html>'),
      contentType: 'text/html',
    })
    .mockResolvedValueOnce({ bytes: Buffer.from(html), contentType: 'text/html' });
  const result = await analyzePhoto(url, new AbortController().signal, 8000);
  expect(result.media.sourceUrl).toBe(url);
  expect(result.photoSources?.size).toBe(1);
  expect(fetchPage.mock.calls.map((args) => args[0] as unknown)).toEqual([
    url,
    url.replace('/photo/', '/video/'),
  ]);
});
it('does not follow another post or bypass cancellation', async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(
    analyzePhoto('https://www.tiktok.com/@creator/photo/123', abort.signal, 8000),
  ).rejects.toThrow();
  expect(fetchPage).not.toHaveBeenCalled();
});
