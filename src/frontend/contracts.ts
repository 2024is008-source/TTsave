import { z } from 'zod';
import { accessTokenSchema, safeFileUrlSchema } from '../api/contracts.js';
import { thumbnailSchema } from '../shared/thumbnail.js';

export { videoUrlSchema } from '../shared/video-url.js';

export const formatSchema = z.object({
  id: z.string().min(1).max(200),
  label: z.string().min(1).max(120),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  container: z.enum(['mp4', 'webm']).optional(),
  hasAudio: z.boolean().optional(),
  compatibility: z.enum(['broad', 'device-dependent']).optional(),
  bitrateKbps: z.number().positive().optional(),
});
export const mediaSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(500).optional(),
  downloadAvailable: z.boolean().optional(),
  creator: z.string().max(200).nullable().optional(),
  durationSeconds: z.number().nonnegative().nullable().optional(),
  thumbnail: thumbnailSchema.nullable().optional(),
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
  downloadedBytes: z.number().int().nonnegative().optional(),
  percent: z.number().min(0).max(100).optional(),
  speedBytesPerSecond: z.number().nonnegative().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export const jobSchema = z.object({
  id: z.string().min(1).max(200),
  accessToken: accessTokenSchema.optional(),
});
export const downloadSchema = z.object({
  url: safeFileUrlSchema,
  expiresAt: z.number().int().positive().optional(),
  qualityLabel: z.string().min(1).max(120).optional(),
  sizeBytes: z.number().int().positive().optional(),
});
export type Media = z.infer<typeof mediaSchema>;
export type Progress = z.infer<typeof progressSchema>;
export type DownloadJob = z.infer<typeof jobSchema>;
export type Download = z.infer<typeof downloadSchema>;

export type DownloaderAdapter = {
  cancelDownload?: (job: DownloadJob) => Promise<void>;
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
