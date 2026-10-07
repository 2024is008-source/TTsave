import { z } from 'zod';
import { videoUrlSchema } from '../shared/video-url.js';

export const analyzeInput = z.object({ url: videoUrlSchema }).strict();
export const opaqueId = z.uuid();
export const downloadInput = z
  .object({ analysisId: opaqueId, formatId: z.string().min(1).max(200) })
  .strict();
export const jobParams = z.object({ jobId: opaqueId });
export const apiFormat = z.object({
  id: z.string().min(1).max(200),
  container: z.enum(['mp4', 'webm']),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  qualityLabel: z.string().min(1).max(120),
  estimatedBytes: z.number().int().nonnegative().optional(),
  hasAudio: z.boolean(),
});
export const analysisSchema = z.object({
  id: opaqueId,
  title: z.string().min(1).max(500),
  creator: z.string().max(200).nullable(),
  thumbnail: z
    .string()
    .regex(/^\/assets\/images\/[a-zA-Z0-9_-]+\.webp$/)
    .nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
  sourceUrl: videoUrlSchema,
  formats: z
    .array(apiFormat)
    .min(1)
    .max(30)
    .refine(
      (formats) => new Set(formats.map((format) => format.id)).size === formats.length,
    ),
  mock: z.boolean(),
  downloadAvailable: z.boolean().default(false),
});
export const accessTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const fileQuery = z.object({ token: accessTokenSchema }).strict();
export const apiProgressSchema = z.object({
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
