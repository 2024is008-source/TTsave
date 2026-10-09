import { z } from 'zod';
import { videoUrlSchema } from '../shared/video-url.js';
import { thumbnailSchema, photoItemSchema } from '../shared/thumbnail.js';

export const analyzeInput = z.object({ url: videoUrlSchema }).strict();
export const opaqueId = z.uuid();
export const downloadInput = z.discriminatedUnion('downloadType', [
  z
    .object({
      analysisId: opaqueId,
      formatId: z.string().min(1).max(200),
      downloadType: z.literal('mp4'),
    })
    .strict(),
  z.object({ analysisId: opaqueId, downloadType: z.literal('mp3') }).strict(),
  z
    .object({
      analysisId: opaqueId,
      photoId: opaqueId,
      capability: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      downloadType: z.literal('image'),
    })
    .strict(),
]);
export const compatibleDownloadInput = z.preprocess((value) => {
  if (value && typeof value === 'object' && !('downloadType' in value))
    return { ...value, downloadType: 'mp4' };
  return value;
}, downloadInput);
export const jobParams = z.object({ jobId: opaqueId });
export const apiFormat = z.object({
  id: z.string().min(1).max(200),
  container: z.enum(['mp4', 'webm']),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  qualityLabel: z.string().min(1).max(120),
  estimatedBytes: z.number().int().nonnegative().optional(),
  hasAudio: z.boolean(),
  compatibility: z.enum(['broad', 'device-dependent']).optional(),
  bitrateKbps: z.number().positive().optional(),
});
export const analysisSchema = z
  .object({
    postType: z.enum(['video', 'photo']).optional(),
    photos: z.array(photoItemSchema).min(1).max(35).optional(),
    capability: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
    id: opaqueId,
    title: z.string().min(1).max(500),
    creator: z.string().max(200).nullable(),
    thumbnail: thumbnailSchema.nullable(),
    durationSeconds: z.number().nonnegative().nullable(),
    sourceUrl: videoUrlSchema,
    formats: z
      .array(apiFormat)
      .max(30)
      .refine(
        (formats) => new Set(formats.map((format) => format.id)).size === formats.length,
      ),
    mock: z.boolean(),
    downloadAvailable: z.boolean().default(false),
    capabilities: z
      .object({ mp4: z.boolean(), mp3: z.boolean(), images: z.boolean().optional() })
      .optional(),
  })
  .refine((value) =>
    value.postType === 'photo'
      ? value.formats.length === 0 &&
        !!value.photos?.length &&
        !!value.capability &&
        value.capabilities?.images === true &&
        !value.capabilities.mp4 &&
        !value.capabilities.mp3 &&
        new Set(value.photos.map((photo) => photo.id)).size === value.photos.length &&
        value.photos.every(
          (photo, index) =>
            photo.position === index + 1 &&
            photo.previewUrl ===
              `/api/v1/analysis/${value.id}/photos/${photo.id}/preview?token=${value.capability ?? ''}`,
        )
      : value.formats.length > 0 && !value.photos && !value.capability,
  );
export const accessTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const fileQuery = z.object({ token: accessTokenSchema }).strict();
export const apiProgressSchema = z.object({
  phase: z.enum(['downloading', 'converting']).optional(),
  downloadedBytes: z.number().int().nonnegative().optional(),
  percent: z.number().min(0).max(100).optional(),
  speedBytesPerSecond: z.number().nonnegative().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export const safeFileUrlSchema = z
  .string()
  .max(2048)
  .refine(
    (value) =>
      /^\/api\/v1\/downloads\/[a-zA-Z0-9_-]+\/file(?:\?token=[A-Za-z0-9_-]{43})?$/.test(
        value,
      ),
    'Invalid file URL.',
  );
export const jobErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  fieldErrors: z.record(z.string(), z.array(z.string())),
  requestId: z.string(),
});
export const apiJobSchema = z.object({
  downloadType: z.enum(['mp4', 'mp3', 'image']).optional(),
  id: opaqueId,
  analysisId: opaqueId,
  formatId: z.string().min(1).max(200),
  status: z.enum([
    'queued',
    'downloading',
    'ready',
    'delivering',
    'delivered',
    'cancelled',
    'error',
    'expired',
  ]),
  mock: z.boolean(),
  accessToken: accessTokenSchema.optional(),
  progress: apiProgressSchema.optional(),
  fileUrl: safeFileUrlSchema.optional(),
  fileExpiresAt: z.number().int().positive().optional(),
  deliveredFormat: apiFormat
    .extend({ container: z.enum(['mp4', 'webm', 'mp3']) })
    .optional(),
  error: jobErrorSchema.optional(),
});
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    fieldErrors: z.record(z.string(), z.array(z.string())),
    requestId: z.string(),
  }),
});
export type Analysis = z.infer<typeof analysisSchema>;
export type ApiJob = z.infer<typeof apiJobSchema>;
