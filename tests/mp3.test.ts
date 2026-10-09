import { expect, it } from 'vitest';
import { audioFilename } from '../src/services/mp3.js';
it('creates bounded ASCII MP3 filenames from untrusted metadata', () => {
  for (const title of [
    '../../evil\r\nContent-Type: text/html',
    '音楽',
    'x'.repeat(300),
    'CON <script>',
  ]) {
    const name = audioFilename('creator"\r\n', title);
    expect(name).toMatch(/^[\p{L}\p{N}\p{M}_-]+\.mp3$/u);
    expect(Buffer.byteLength(name)).toBeLessThanOrEqual(164);
    expect(name).not.toContain('..');
  }
  expect(audioFilename(null, '音楽')).toBe('音楽.mp3');
});
