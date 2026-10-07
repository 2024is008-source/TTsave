import { z } from 'zod';
import path from 'node:path';

const executable = (name: string) =>
  z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .refine(
      (value) =>
        !/[\p{Cc}]/u.test(value) &&
        !/\.(?:cmd|bat|ps1)$/i.test(value) &&
        ([name, `${name}.exe`].includes(value) ||
          (path.isAbsolute(value) &&
            !value.startsWith('\\\\') &&
            !value.startsWith('//'))),
      'Use a local absolute executable path or the approved tool name.',
    )
    .default(name);

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  TRUST_PROXY: booleanFromString,
  YTDLP_PATH: executable('yt-dlp'),
  FFMPEG_PATH: executable('ffmpeg'),
  ANALYSIS_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
  ANALYSIS_MAX_OUTPUT_BYTES: z.coerce
    .number()
    .int()
    .min(65_536)
    .max(8_388_608)
    .default(2_097_152),
  ANALYSIS_MAX_CONCURRENT: z.coerce.number().int().min(1).max(8).default(2),
});

export type Environment = z.infer<typeof envSchema>;

export function parseEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}

export const env = parseEnvironment();
