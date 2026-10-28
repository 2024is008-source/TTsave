import { z } from 'zod';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { adminHashSchema } from '../shared/admin-settings.js';

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
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

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
  GA_MEASUREMENT_ID: z.preprocess(
    (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
    z
      .string()
      .regex(/^G-[A-Z0-9]{10}$/)
      .optional(),
  ),
  LEGAL_CONTACT_EMAIL: z.email().optional(),
  PUBLIC_CONTACT_EMAIL: z.email().default('tiksavemp4@gmail.com'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  TRUST_PROXY: booleanFromString,
  ADMIN_ENABLED: booleanFromString,
  ADMIN_USERNAME: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .regex(/^[a-zA-Z0-9._@+-]{3,128}$/)
      .optional(),
  ),
  ADMIN_PASSWORD_HASH: z.preprocess(
    (value) => (value === '' ? undefined : value),
    adminHashSchema.optional(),
  ),
  ADMIN_SESSION_TTL_MINUTES: z.coerce.number().int().min(15).max(120).default(30),
  ADMIN_SESSION_MAX_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  ADVERTISING_ENABLED: booleanFromString,
  MONETAG_IPP_ENABLED: booleanFromString,
  MONETAG_VIGNETTE_ENABLED: booleanFromString,
  MONETAG_MOBILE_ENABLED: booleanFromString,
  MONETAG_IPP_TAG_FILE: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .refine((value) => path.isAbsolute(value), 'Use an absolute private manifest path.')
      .optional(),
  ),
  MONETAG_VIGNETTE_TAG_FILE: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .refine((value) => path.isAbsolute(value), 'Use an absolute private manifest path.')
      .optional(),
  ),
  OPERATIONS_ENABLED: booleanFromString,
  OPERATIONS_SECRET: z.string().min(32).max(256).optional(),
  OPERATIONS_DATA_DIR: z
    .string()
    .refine((value) => path.isAbsolute(value), 'Use an absolute private data directory.')
    .default(path.resolve('.data', 'operations')),
  OPERATIONS_RETENTION_DAYS: z.coerce.number().int().min(7).max(180).default(30),
  GA4_PROPERTY_ID: z
    .string()
    .regex(/^\d{1,20}$/)
    .optional(),
  GA4_SERVICE_ACCOUNT_FILE: z
    .string()
    .refine((value) => path.isAbsolute(value))
    .optional(),
  GA4_REQUIRE_CONSENT: z
    .enum(['true', 'false', '1', '0'])
    .default('true')
    .transform((value) => value === 'true' || value === '1'),
  TRUST_COUNTRY_HEADER: booleanFromString,
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
    .default(path.join(tmpdir(), 'tiksavemp4')),
});

export type Environment = z.infer<typeof envSchema>;

export function parseEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  if (
    source.YT_DLP_PATH !== undefined &&
    source.YTDLP_PATH !== undefined &&
    source.YT_DLP_PATH !== source.YTDLP_PATH
  )
    throw new Error('Invalid environment configuration: configure only one yt-dlp path.');
  const normalized = {
    ...source,
    ...(source.YT_DLP_PATH !== undefined ? { YTDLP_PATH: source.YT_DLP_PATH } : {}),
  };
  const schema =
    source.NODE_ENV === 'production'
      ? envSchema.extend({
          PUBLIC_BASE_URL: publicBaseUrlSchema,
          HOST: z.literal('127.0.0.1').default('127.0.0.1'),
        })
      : envSchema;
  const result = schema.safeParse(normalized);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const publicDirectory = path.resolve('public');
  if (
    result.data.ADMIN_ENABLED &&
    (!result.data.ADMIN_USERNAME || !result.data.ADMIN_PASSWORD_HASH)
  )
    throw new Error(
      'ADMIN_ENABLED requires ADMIN_USERNAME and a generated ADMIN_PASSWORD_HASH.',
    );
  if (
    result.data.OPERATIONS_DATA_DIR === publicDirectory ||
    result.data.OPERATIONS_DATA_DIR.startsWith(publicDirectory + path.sep)
  )
    throw new Error('Operational storage must be outside the public directory.');
  return result.data;
}

export const env = parseEnvironment();
