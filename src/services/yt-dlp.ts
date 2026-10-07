import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';
import type { Analysis } from '../api/contracts.js';
import { env, type Environment } from '../config/env.js';
import { videoUrlSchema } from '../shared/video-url.js';
import { HttpError } from '../middleware/error-handler.js';
import { runTool, type AnalysisContext } from './tool-process.js';

const optionalNumber = z.number().nullable().optional();
const extractorFormat = z.object({
  url: z.string().optional(),
  ext: z.string().optional(),
  protocol: z.string().optional(),
  vcodec: z.string().nullable().optional(),
  acodec: z.string().nullable().optional(),
  width: optionalNumber,
  height: optionalNumber,
  filesize: optionalNumber,
  has_drm: z.boolean().nullable().optional(),
});
const extractorMetadata = z.object({
  title: z.string().min(1),
  uploader: z.string().nullable().optional(),
  creator: z.string().nullable().optional(),
  duration: optionalNumber,
  availability: z.string().nullable().optional(),
  extractor_key: z.enum(['TikTok', 'TikTokVM']),
  _type: z.literal('video').optional(),
  formats: z.array(extractorFormat).max(1000),
  is_live: z.boolean().optional(),
});

export function extractorError(stderr: string): HttpError {
  if (/private|login|log in|sign in|authentication|friends.only|cookie/i.test(stderr))
    return new HttpError(
      422,
      'VIDEO_NOT_PUBLIC',
      'This video requires restricted access. Use a publicly accessible TikTok video.',
    );
  if (/geo.?restrict|not available in your country|region|country/i.test(stderr))
    return new HttpError(
      422,
      'REGION_RESTRICTED',
      'This video is unavailable in the server’s region. TTSave cannot bypass that restriction.',
    );
  if (/404|not found|unavailable|removed|deleted/i.test(stderr))
    return new HttpError(
      422,
      'VIDEO_UNAVAILABLE',
      'This public video is unavailable or was removed.',
    );
  if (/429|too many requests|rate.limit/i.test(stderr))
    return new HttpError(
      503,
      'SOURCE_RATE_LIMITED',
      'TikTok is limiting requests. Please try again later.',
    );
  return new HttpError(
    502,
    'EXTRACTOR_FAILED',
    'The public video could not be analyzed. Please try again later.',
  );
}

const positiveInteger = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined && Number.isSafeInteger(value) && value > 0;

export function normalizeMetadata(payload: unknown, sourceUrl: string): Analysis {
  const parsed = extractorMetadata.safeParse(payload);
  if (!parsed.success)
    throw new HttpError(
      502,
      'INVALID_METADATA',
      'The video source returned unsupported metadata.',
    );
  const data = parsed.data;
  if (data.availability && data.availability !== 'public')
    throw new HttpError(
      422,
      'VIDEO_NOT_PUBLIC',
      'Use a publicly accessible TikTok video.',
    );
  if (data.is_live)
    throw new HttpError(
      422,
      'UNSUPPORTED_VIDEO',
      'Live video downloads are not supported.',
    );
  const formats: Analysis['formats'] = [];
  for (const format of data.formats) {
    if (
      format.ext !== 'mp4' ||
      format.protocol !== 'https' ||
      format.has_drm ||
      !format.url ||
      !format.vcodec ||
      format.vcodec === 'none' ||
      format.vcodec === 'unknown' ||
      !format.acodec ||
      format.acodec === 'none' ||
      format.acodec === 'unknown'
    )
      continue;
    let mediaUrl: URL;
    try {
      mediaUrl = new URL(format.url);
    } catch {
      continue;
    }
    if (mediaUrl.protocol !== 'https:' || mediaUrl.username || mediaUrl.password)
      continue;
    const hostname = mediaUrl.hostname.replace(/^\[|\]$/g, '');
    if (
      isIP(hostname) ||
      !hostname.includes('.') ||
      /(?:^|\.)(?:localhost|local|internal|test)$/i.test(hostname)
    )
      continue;
    const width = positiveInteger(format.width) ? format.width : undefined;
    const height = positiveInteger(format.height) ? format.height : undefined;
    const size = positiveInteger(format.filesize) ? format.filesize : undefined;
    formats.push({
      id: `source-${String(formats.length + 1)}`,
      container: 'mp4',
      qualityLabel:
        width && height
          ? `${String(width)} × ${String(height)} source pixels`
          : 'Source MP4 video',
      hasAudio: true,
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
      ...(size === undefined ? {} : { estimatedBytes: size }),
    });
    if (formats.length === 30) break;
  }
  if (!formats.length)
    throw new HttpError(
      422,
      'NO_DELIVERABLE_FORMATS',
      'No supported single-file MP4 video with audio is available.',
    );
  return {
    id: randomUUID(),
    title: data.title.slice(0, 500),
    creator: (data.uploader ?? data.creator)?.slice(0, 200) ?? null,
    thumbnail: null,
    durationSeconds:
      data.duration !== null && data.duration !== undefined && data.duration >= 0
        ? data.duration
        : null,
    sourceUrl,
    formats,
    mock: false,
    downloadAvailable: false,
  };
}

export class YtDlpAnalyzer {
  private active = 0;
  constructor(private readonly config: Environment = env) {}
  async analyze(input: string, context: AnalysisContext): Promise<Analysis> {
    const url = videoUrlSchema.parse(input);
    if (this.active >= this.config.ANALYSIS_MAX_CONCURRENT)
      throw new HttpError(
        503,
        'ANALYSIS_BUSY',
        'Video analysis is busy. Please try again shortly.',
      );
    this.active += 1;
    try {
      const result = await runTool(
        this.config.YTDLP_PATH,
        [
          '--ignore-config',
          '--no-plugin-dirs',
          '--no-cache-dir',
          '--no-cookies',
          '--no-cookies-from-browser',
          '--no-geo-bypass',
          '--no-playlist',
          '--simulate',
          '--dump-single-json',
          '--no-warnings',
          '--no-progress',
          '--socket-timeout',
          '10',
          '--retries',
          '0',
          '--extractor-retries',
          '0',
          '--use-extractors',
          'TikTok,TikTokVM',
          '--',
          url,
        ],
        {
          timeoutMs: this.config.ANALYSIS_TIMEOUT_MS,
          maxOutputBytes: this.config.ANALYSIS_MAX_OUTPUT_BYTES,
        },
        context,
      );
      if (result.code !== 0) {
        const error = extractorError(result.stderr);
        context.logger.warn(
          { requestId: context.requestId, code: error.code, exitCode: result.code },
          'TikTok extraction failed',
        );
        throw error;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(result.stdout) as unknown;
      } catch {
        throw new HttpError(
          502,
          'INVALID_METADATA',
          'The video source returned unsupported metadata.',
        );
      }
      return normalizeMetadata(payload, url);
    } finally {
      this.active -= 1;
    }
  }
}
