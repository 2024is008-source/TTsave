import { z } from 'zod';

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

export const formatSchema = z.object({
  id: z.string().min(1).max(200),
  label: z.string().min(1).max(120),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export const mediaSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(500).optional(),
  formats: z
    .array(formatSchema)
    .min(1)
    .max(30)
    .refine(
      (formats) => new Set(formats.map((format) => format.id)).size === formats.length,
      'Format IDs must be unique.',
    ),
});
export const progressSchema = z.object({
  percent: z.number().min(0).max(100).optional(),
  speedBytesPerSecond: z.number().nonnegative().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export const jobSchema = z.object({ id: z.string().min(1).max(200) });
export const downloadSchema = z.object({
  url: z
    .string()
    .max(2048)
    .refine((url) => /^\/downloads\/[a-zA-Z0-9_-]+$/.test(url), 'Invalid download URL.'),
});
export type Media = z.infer<typeof mediaSchema>;
export type Progress = z.infer<typeof progressSchema>;
export type DownloadJob = z.infer<typeof jobSchema>;
export type Download = z.infer<typeof downloadSchema>;

export type DownloaderAdapter = {
  analyze: (url: string, signal: AbortSignal) => Promise<Media>;
  startDownload: (
    mediaId: string,
    formatId: string,
    signal: AbortSignal,
  ) => Promise<DownloadJob>;
  waitForDownload: (
    job: DownloadJob,
    signal: AbortSignal,
    onProgress: (progress: unknown) => void,
  ) => Promise<Download>;
};
