import { expect, it } from 'vitest';
import { attachmentHeader, downloadFilename } from '../src/services/filename.js';
it.each(['mp4', 'mp3', 'jpg', 'png', 'webp'] as const)(
  'uses server titles and actual %s extensions',
  (extension) => {
    expect(
      downloadFilename(
        'Evening walk #fyp',
        'creator',
        extension,
        extension === 'jpg' ? 2 : undefined,
      ),
    ).toBe(`creator-Evening-walk${extension === 'jpg' ? '-02' : ''}.${extension}`);
  },
);
it.each([
  '../../evil\r\nContent-Type: text/html',
  'CON',
  '日本語\u202Etitle\u200B',
  'x'.repeat(1000),
  '"\\<>:?*|/',
])('bounds and sanitizes filenames: %s', (title) => {
  const name = downloadFilename(title, null, 'mp4');
  expect(name).not.toMatch(/[\p{Cc}\p{Cf}\\/:"<>?*|]/u);
  expect(name).not.toContain('..');
  expect(Buffer.byteLength(name)).toBeLessThanOrEqual(164);
  expect(attachmentHeader(name)).toMatch(
    /^attachment; filename="[a-zA-Z0-9._-]+"; filename\*=UTF-8''/,
  );
  expect(attachmentHeader(name)).not.toMatch(/[\r\n]/);
});
it('preserves Unicode in encoded headers and uses deterministic empty fallbacks', () => {
  expect(attachmentHeader(downloadFilename('日本語', null, 'mp4'))).toContain(
    encodeURIComponent('日本語.mp4'),
  );
  expect(downloadFilename('', 'creator', 'mp4')).toBe('tiktok-video.mp4');
  expect(downloadFilename('', null, 'mp3')).toBe('tiktok-audio.mp3');
  expect(downloadFilename('#fyp', null, 'jpg', 1)).toBe('tiktok-photo-01.jpg');
  expect(attachmentHeader('evil\r\nX-Test: injected.mp4')).not.toMatch(/[\r\n]/);
});
