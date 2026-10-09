import { z } from 'zod';

export const MAX_VIDEO_URL_LENGTH = 2048;
export const APPROVED_TIKTOK_HOSTS = [
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
] as const;
export const URL_MESSAGES = {
  required: 'Paste a TikTok video URL to continue.',
  invalid: 'Enter a public TikTok video link using HTTPS.',
  https: 'Use an HTTPS TikTok video link.',
  credentials: 'Use a TikTok link without embedded usernames or passwords.',
  long: 'This link is too long. Use a TikTok video URL of 2,048 characters or fewer.',
} as const;
export const safeUrlMessages = new Set<string>(Object.values(URL_MESSAGES));

/** Syntax validation only: no DNS, redirects or network access; not proof of publicity. */
export const tiktokUrlSchema = z
  .string({ error: URL_MESSAGES.required })
  .max(MAX_VIDEO_URL_LENGTH, URL_MESSAGES.long)
  .trim()
  .min(1, URL_MESSAGES.required)
  .transform((value, context) => {
    const reject = (message: string) => {
      context.addIssue({ code: 'custom', message });
      return z.NEVER;
    };
    // Check the literal authority before WHATWG URL can decode or repair it.
    // This rejects encoded/unicode hosts, backslashes, whitespace and empty userinfo.
    if (/[\s\\\p{Cc}]/u.test(value)) return reject(URL_MESSAGES.invalid);
    if (!/^https:\/\//i.test(value)) {
      return reject(
        /^[a-z][a-z\d+.-]*:/i.test(value) ? URL_MESSAGES.https : URL_MESSAGES.invalid,
      );
    }
    const authority = /^https:\/\/([^/?#]+)/i.exec(value)?.[1];
    if (!authority) return reject(URL_MESSAGES.invalid);
    if (authority.includes('@')) return reject(URL_MESSAGES.credentials);
    const hostname = authority.toLowerCase();
    // Exact membership excludes every IP address, localhost, lookalike and subdomain.
    if (!APPROVED_TIKTOK_HOSTS.some((host) => host === hostname))
      return reject(URL_MESSAGES.invalid);
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return reject(URL_MESSAGES.invalid);
    }
    if (url.hostname !== hostname || url.username || url.password || url.port)
      return reject(URL_MESSAGES.invalid);
    const rawPath = value.slice('https://'.length + authority.length).split(/[?#]/, 1)[0];
    if (rawPath !== url.pathname) return reject(URL_MESSAGES.invalid);
    if (url.href.length > MAX_VIDEO_URL_LENGTH) return reject(URL_MESSAGES.long);
    return url.href;
  });

// Submitted inputs retain the existing narrow public-video/short-code path rules.
export const videoUrlSchema = tiktokUrlSchema.refine((value) => {
  const url = new URL(value);
  return url.hostname === 'vm.tiktok.com' || url.hostname === 'vt.tiktok.com'
    ? /^\/[a-zA-Z0-9]+\/?$/.test(url.pathname)
    : /^\/@[a-zA-Z0-9._]+\/(?:video|photo)\/\d+\/?$/.test(url.pathname);
}, URL_MESSAGES.invalid);
