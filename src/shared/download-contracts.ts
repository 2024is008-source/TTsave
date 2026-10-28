import { z } from 'zod';

export const accessTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const progressSchema = z.object({
  phase: z.enum(['downloading', 'converting']).optional(),
  downloadedBytes: z.number().int().nonnegative().optional(),
  percent: z.number().min(0).max(100).optional(),
  speedBytesPerSecond: z.number().nonnegative().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
