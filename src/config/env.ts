import { z } from 'zod';
import path from 'node:path';
import { tmpdir } from 'node:os';

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

const publicBaseUrlSchema = z
  .url()
  .refine((value) => {
    if (!/^https:\/\/tiksavemp4\.online\/?$/i.test(value)) return false;
    const url = new URL(value);
    return (
      url.origin === 'https://tiksavemp4.online' &&
      url.pathname === '/' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !url.port
    );
  }, 'Use https://tiksavemp4.online without credentials, a path, port, query or fragment.')
  .transform(() => 'https://tiksavemp4.online');

const envSchema = z.object({
  PUBLIC_BASE_URL: publicBaseUrlSchema.default('https://tiksavemp4.online'),
  LEGAL_CONTACT_EMAIL: z.email().optional(),
  PUBLIC_CONTACT_EMAIL: z.email().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  TRUST_PROXY: booleanFromString,
  YTDLP_PATH: executable('yt-dlp'),
  FFMPEG_PATH: executable('ffmpeg'),
  FFPROBE_PATH: executable('ffprobe'),
  PREVIEW_MAX_BYTES: z.coerce.number().int().min(1024).max(8_388_608).default(3_145_728),
  PREVIEW_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30_000).default(8000),
  ANALYSIS_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
  ANALYSIS_MAX_OUTPUT_BYTES: z.coerce
    .number()
    .int()
    .min(65_536)
    .max(8_388_608)
    .default(2_097_152),
  ANALYSIS_MAX_CONCURRENT: z.coerce.number().int().min(1).max(8).default(2),
  DOWNLOAD_MAX_CONCURRENT: z.coerce.number().int().min(1).max(8).default(2),
  APPLICATION_MAX_CONCURRENT: z.coerce.number().int().min(1).max(16).default(4),
  DOWNLOAD_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(120_000),
  MAX_VIDEO_DURATION_SECONDS: z.coerce.number().int().min(1).max(3600).default(600),
  DOWNLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(1_073_741_824)
    .default(104_857_600),
  JOB_TTL_MS: z.coerce.number().int().min(1000).max(3_600_000).default(600_000),
  FILE_ACCESS_TTL_MS: z.coerce.number().int().min(1000).max(300_000).default(60_000),
  JOB_SWEEP_INTERVAL_MS: z.coerce.number().int().min(1000).max(60_000).default(30_000),
  DOWNLOAD_TEMP_ROOT: z
    .string()
    .min(1)
    .max(2048)
    .refine(
      (value) =>
        path.isAbsolute(value) &&
        !/[\p{Cc}]/u.test(value) &&
        !value.startsWith('\\\\') &&
        !value.startsWith('//'),
      'Use a local absolute temporary root.',
    )
    .default(path.join(tmpdir(), 'ttsave')),
});

export type Environment = z.infer<typeof envSchema>;

export function parseEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const schema =
    source.NODE_ENV === 'production'
      ? envSchema.extend({ PUBLIC_BASE_URL: publicBaseUrlSchema })
      : envSchema;
  const result = schema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}

export const env = parseEnvironment();
