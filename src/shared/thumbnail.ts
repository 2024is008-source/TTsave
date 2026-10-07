import { z } from 'zod';

export const thumbnailHosts = ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com'];
export const remoteThumbnailSchema = z
  .string()
  .max(4096)
  .refine((value) => {
    try {
      const url = new URL(value);
      const authority = /^https:\/\/([^/]+)/i.exec(value)?.[1];
      return (
        !!authority &&
        !authority.includes('%') &&
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.port &&
        !/\.(?:mp4|webm|m3u8|mpd)(?:$|\/)/i.test(url.pathname) &&
        thumbnailHosts.some(
          (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
        )
      );
    } catch {
      return false;
    }
  }, 'Unsupported preview image.');
export const thumbnailSchema = z
  .string()
  .max(512)
  .refine(
    (value) =>
      /^\/assets\/images\/[a-zA-Z0-9_-]+\.webp$/.test(value) ||
      /^\/api\/v1\/analysis\/[a-f0-9-]{36}\/thumbnail\?token=[A-Za-z0-9_-]{43}$/.test(
        value,
      ),
    'Unsupported preview image.',
  );
