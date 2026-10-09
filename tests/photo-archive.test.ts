import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { writePhotoArchive } from '../src/services/photo-archive.js';
const fetchImage = vi.hoisted(() => vi.fn());
vi.mock('../src/services/photo-images.js', () => ({ fetchPhotoImage: fetchImage }));
const roots: string[] = [];
async function destination() {
  const root = await mkdtemp(path.join(tmpdir(), 'tiksavemp4-archive-test-'));
  roots.push(root);
  return path.join(root, 'output.zip');
}
afterEach(async () => {
  fetchImage.mockReset();
  for (const root of roots.splice(0)) {
    if (
      path.dirname(root) !== path.resolve(tmpdir()) ||
      !path.basename(root).startsWith('tiksavemp4-archive-test-')
    )
      throw new Error('Unsafe test root');
    await rm(root, { recursive: true, force: true });
  }
});
const photos = [
  { url: 'https://p16.tiktokcdn.com/1', position: 1 },
  { url: 'https://p16.tiktokcdn.com/2', position: 2 },
];
it('writes a standard UTF-8 stored archive with a known CRC32 and bounded safe names', async () => {
  const file = await destination();
  fetchImage.mockResolvedValue({ bytes: Buffer.from('123456789'), extension: 'jpg' });
  const size = await writePhotoArchive(
    file,
    photos,
    { title: '../../世界 unsafe #tag', creator: 'creator' },
    new AbortController().signal,
  );
  const bytes = await readFile(file);
  expect(size).toBe(bytes.length);
  expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
  expect(bytes.readUInt16LE(6)).toBe(0x800);
  expect(bytes.readUInt32LE(14)).toBe(0xcbf43926);
  expect(bytes.toString('utf8')).toContain('creator-世界-unsafe-01.jpg');
  expect(bytes.toString('utf8')).not.toContain('../');
  expect(bytes.readUInt16LE(bytes.length - 12)).toBe(2);
  expect(fetchImage).toHaveBeenCalledTimes(2);
});
it('bounds complete output including ZIP headers before writing an oversized member', async () => {
  fetchImage.mockResolvedValue({ bytes: Buffer.alloc(12), extension: 'png' });
  await expect(
    writePhotoArchive(
      await destination(),
      photos,
      { title: 'title', creator: null },
      new AbortController().signal,
      20,
    ),
  ).rejects.toMatchObject({ code: 'IMAGES_TOO_LARGE' });
});
it('enforces the 64 MiB original-byte budget even when the output budget is higher', async () => {
  fetchImage.mockResolvedValue({
    bytes: Buffer.alloc(10 * 1024 * 1024),
    extension: 'jpg',
  });
  await expect(
    writePhotoArchive(
      await destination(),
      Array.from({ length: 7 }, (_, index) => ({
        url: `https://p16.tiktokcdn.com/${String(index)}`,
        position: index + 1,
      })),
      { title: 'title', creator: null },
      new AbortController().signal,
      100 * 1024 * 1024,
    ),
  ).rejects.toMatchObject({ code: 'IMAGES_TOO_LARGE' });
  expect(fetchImage).toHaveBeenCalledTimes(7);
});
it('stops fetching further images on cancellation and closes the output', async () => {
  const controller = new AbortController();
  fetchImage.mockImplementationOnce(() => {
    controller.abort();
    return { bytes: Buffer.alloc(12), extension: 'png' };
  });
  await expect(
    writePhotoArchive(
      await destination(),
      photos,
      { title: 'title', creator: null },
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(fetchImage).toHaveBeenCalledTimes(1);
});
