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
export const apiJobSchema = z.object({
  id: opaqueId,
  analysisId: opaqueId,
  formatId: z.string().min(1).max(200),
  status: z.enum(['queued', 'cancelled']),
  mock: z.literal(true),
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
