import { describe, expect, it } from 'vitest';
import {
  MAX_VIDEO_URL_LENGTH,
  URL_MESSAGES,
  videoUrlSchema,
} from '../src/shared/video-url.js';

const rejectedVideoUrls = [
  'plain text',
  '@creator',
  'www.tiktok.com/@creator/video/123',
  '',
  'http://www.tiktok.com/@creator/video/123',
  'ftp://tiktok.com/@creator/video/123',
  '//www.tiktok.com/@creator/video/123',
  'https:tiktok.com/@creator/video/123',
  'https:///www.tiktok.com/@creator/video/123',
  'https://',
  'https://user:password@www.tiktok.com/@creator/video/123',
  'https://@www.tiktok.com/@creator/video/123',
  'https://www.tiktok.com@evil.test/@creator/video/123',
  'https://tiktok.com.evil.test/@creator/video/123',
  'https://evil.tiktok.com/@creator/video/123',
  'https://www.tiktok.com.evil.test/@creator/video/123',
  'https://tik-tok.com/@creator/video/123',
  'https://tiktоk.com/@creator/video/123', // Cyrillic o
  'https://ｔｉｋｔｏｋ.com/@creator/video/123', // IDNA normalization lookalike
  'https://www。tiktok.com/@creator/video/123',
  'https://%74iktok.com/@creator/video/123',
  'https://www%2etiktok.com/@creator/video/123',
  'https://tiktok.com%2eevil.test/@creator/video/123',
  'https://localhost/@creator/video/123',
  'https://127.0.0.1/@creator/video/123',
  'https://10.0.0.1/@creator/video/123',
  'https://172.16.0.1/@creator/video/123',
  'https://192.168.1.1/@creator/video/123',
  'https://169.254.169.254/@creator/video/123',
  'https://2130706433/@creator/video/123',
  'https://0x7f000001/@creator/video/123',
  'https://[::1]/@creator/video/123',
  'https://[fc00::1]/@creator/video/123',
  'https://[fe80::1]/@creator/video/123',
  'https://[::ffff:127.0.0.1]/@creator/video/123',
  'https://example.com/?url=https://tiktok.com/@creator/video/123',
  'https://tiktok.com:8443/@creator/video/123',
  'https://tiktok.com:443/@creator/video/123',
  'https://tiktok.com./@creator/video/123',
  'https://www.tik\ntok.com/@creator/video/123',
  'https://www.tiktok.com\\@evil.test/@creator/video/123',
  'https://www.tiktok.com/@creator/video/not-a-number',
  'https://www.tiktok.com/@creator',
  'https://www.tiktok.com/',
  'https://vm.tiktok.com/',
  'https://vt.tiktok.com/abc/extra',
  'https://[broken/@creator/video/123',
  'https://www.tiktok.com/a/../@creator/video/123',
  'https://www.tiktok.com/%2e%2e/@creator/video/123',
  'https://www.tiktok.com/@creator/video/123\u0000',
  'https://www.tiktok.com/@creator/video/123\u007f',
  `https://www.tiktok.com/@creator/video/123?x=${'雪'.repeat(400)}`,
  `https://www.tiktok.com/@creator/video/123?x=${'a'.repeat(MAX_VIDEO_URL_LENGTH)}`,
];

describe('public TikTok URL syntax', () => {
  it.each([
    'https://tiktok.com/@creator/video/123',
    'https://www.tiktok.com/@creator.name_1/video/1234567890/',
    'https://m.tiktok.com/@creator/video/123',
    'https://vm.tiktok.com/ZMabc123/',
    'https://vt.tiktok.com/ZSabc123',
    'https://www.tiktok.com/@creator/video/123?is_from_webapp=1&sender_device=pc',
  ])('accepts a supported video or short URL: %s', (url) => {
    expect(videoUrlSchema.parse(url)).toBe(url);
  });
  it('normalizes hostname casing and surrounding paste whitespace', () => {
    expect(
      videoUrlSchema.parse('  HTTPS://WWW.TikTok.COM/@Creator/video/123?x=One#caption  '),
    ).toBe('https://www.tiktok.com/@Creator/video/123?x=One#caption');
  });
  it.each(rejectedVideoUrls)('rejects unsafe or malformed input: %s', (url) => {
    expect(videoUrlSchema.safeParse(url).success).toBe(false);
  });
  it('enforces the length boundary and friendly messages', () => {
    const prefix = 'https://www.tiktok.com/@creator/video/123?x=';
    expect(
      videoUrlSchema.parse(prefix + 'a'.repeat(MAX_VIDEO_URL_LENGTH - prefix.length)),
    ).toHaveLength(MAX_VIDEO_URL_LENGTH);
    for (const [value, message] of [
      [undefined, URL_MESSAGES.required],
      [null, URL_MESSAGES.required],
      [' ', URL_MESSAGES.required],
      ['a'.repeat(2049), URL_MESSAGES.long],
      ['http://tiktok.com/@a/video/1', URL_MESSAGES.https],
      ['https://a:b@tiktok.com/@a/video/1', URL_MESSAGES.credentials],
    ] as const) {
      const result = videoUrlSchema.safeParse(value);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]?.message).toBe(message);
    }
  });
});
