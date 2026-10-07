import { z } from 'zod';

/** Syntax validation only: never an assertion that a TikTok post is public. */
export const videoUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .pipe(z.url())
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      ((['tiktok.com', 'www.tiktok.com'].includes(url.hostname) &&
        /^\/@[^/]+\/video\/\d+\/?$/.test(url.pathname)) ||
        (['vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname) &&
          /^\/[a-zA-Z0-9]+\/?$/.test(url.pathname)))
    );
  }, 'Enter a public TikTok video link using HTTPS.');
