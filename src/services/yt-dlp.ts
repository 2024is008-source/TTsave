import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';
import type { Analysis } from '../api/contracts.js';
import { env, type Environment } from '../config/env.js';
import { videoUrlSchema } from '../shared/video-url.js';
import { HttpError } from '../middleware/error-handler.js';
import { runTool, type AnalysisContext } from './tool-process.js';
import { remoteThumbnailSchema } from '../shared/thumbnail.js';
import { publicExtractorOptions } from './extractor-options.js';
import { resolveTikTokLink } from './tiktok-link.js';

const optionalNumber = z.number().nullable().optional();
const extractorFormat = z.object({
  format_id: z.string().optional(),
  url: z.string().optional(),
  ext: z.string().optional(),
  protocol: z.string().optional(),
  vcodec: z.string().nullable().optional(),
  acodec: z.string().nullable().optional(),
  width: optionalNumber,
  height: optionalNumber,
  filesize: optionalNumber,
  tbr: optionalNumber,
  abr: optionalNumber,
  has_drm: z.boolean().nullable().optional(),
  format_note: z.string().nullable().optional(),
});
const extractorMetadata = z.object({
  title: z.string().min(1),
  uploader: z.string().nullable().optional(),
  creator: z.string().nullable().optional(),
  duration: optionalNumber,
  thumbnail: z.string().nullable().optional(),
  availability: z.string().nullable().optional(),
  extractor_key: z.enum(['TikTok', 'TikTokVM']),
  _type: z.literal('video').optional(),
  formats: z.array(extractorFormat).max(1000),
  is_live: z.boolean().optional(),
});

export function extractorError(stderr: string): HttpError {
  if (
    /\b(?:private (?:video|post)|(?:video|post)(?: is)? private|login|log in|sign in|authentication|friends.only|cookies?)\b/i.test(
      stderr,
    )
  )
    return new HttpError(
      422,
      'VIDEO_NOT_PUBLIC',
      'This video requires restricted access. Use a publicly accessible TikTok video.',
    );
  if (/geo.?restrict|not available in your country|region|country/i.test(stderr))
    return new HttpError(
      422,
      'REGION_RESTRICTED',
      'This video is unavailable in the server’s region. TikSaveMp4 cannot bypass that restriction.',
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

export type AnalyzedSource = {
  media: Analysis;
  selectors: Map<string, string>;
  previewUrl?: string;
  preferred?: Set<string>;
  audioFormatId?: string;
};
export function normalizeMetadata(payload: unknown, sourceUrl: string): Analysis {
  return normalizeSource(payload, sourceUrl).media;
}
function normalizeSource(payload: unknown, sourceUrl: string): AnalyzedSource {
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
  const selectors = new Map<string, string>();
  const candidates: {
    format: z.infer<typeof extractorFormat>;
    key: string;
    bitrate?: number;
    broad: boolean;
    clean: boolean;
  }[] = [];
  for (const format of data.formats) {
    if (
      format.ext !== 'mp4' ||
      format.protocol !== 'https' ||
      format.has_drm ||
      !format.format_id ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(format.format_id) ||
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
    const broad =
      /^(?:avc|h264)/i.test(format.vcodec) && /^(?:aac|mp4a)/i.test(format.acodec);
    const bitrate = format.tbr != null && format.tbr > 0 ? format.tbr : undefined;
    candidates.push({
      format,
      broad,
      clean: /(?:no[_ -]?watermark|without watermark|unwatermarked)/i.test(
        `${format.format_id ?? ''} ${format.format_note ?? ''}`,
      ),
      ...(bitrate === undefined ? {} : { bitrate }),
      key: JSON.stringify([
        format.ext,
        positiveInteger(format.width) ? format.width : null,
        positiveInteger(format.height) ? format.height : null,
        true,
        'single-file',
      ]),
    });
  }
  // Prefer known smaller files, then measured bitrate and a stable selector.
  candidates.sort(
    (a, b) =>
      Number(b.clean) - Number(a.clean) ||
      Number(b.broad) - Number(a.broad) ||
      Number(positiveInteger(b.format.filesize)) -
        Number(positiveInteger(a.format.filesize)) ||
      (positiveInteger(a.format.filesize) && positiveInteger(b.format.filesize)
        ? a.format.filesize - b.format.filesize
        : 0) ||
      (b.bitrate ?? 0) - (a.bitrate ?? 0) ||
      (a.format.format_id ?? '').localeCompare(b.format.format_id ?? ''),
  );
  const distinct: typeof candidates = [];
  for (const candidate of candidates) {
    if (!distinct.some((other) => other.key === candidate.key)) distinct.push(candidate);
  }
  distinct.sort(
    (a, b) =>
      (b.format.width ?? 0) * (b.format.height ?? 0) -
        (a.format.width ?? 0) * (a.format.height ?? 0) ||
      Number(b.broad) - Number(a.broad) ||
      (b.bitrate ?? 0) - (a.bitrate ?? 0),
  );
  const preferred = new Set<string>();
  for (const { format, broad, bitrate, clean } of distinct.slice(0, 30)) {
    const width = positiveInteger(format.width) ? format.width : undefined;
    const height = positiveInteger(format.height) ? format.height : undefined;
    const size = positiveInteger(format.filesize) ? format.filesize : undefined;
    formats.push({
      id: `source-${String(formats.length + 1)}`,
      container: 'mp4',
      qualityLabel:
        width && height ? `${String(Math.min(width, height))}p` : 'Available MP4',
      hasAudio: true,
      compatibility: broad ? 'broad' : 'device-dependent',
      ...(bitrate === undefined ? {} : { bitrateKbps: bitrate }),
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
      ...(size === undefined ? {} : { estimatedBytes: size }),
    });
    if (format.format_id && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(format.format_id))
      selectors.set(`source-${String(formats.length)}`, format.format_id);
    if (clean) preferred.add(`source-${String(formats.length)}`);
  }
  if (!formats.length)
    throw new HttpError(
      422,
      'NO_DELIVERABLE_FORMATS',
      'No supported single-file MP4 video with audio is available.',
    );
  const preview = remoteThumbnailSchema.safeParse(data.thumbnail);
  const bestAudio = [...distinct.slice(0, 30)].sort(
    (a, b) => (b.format.abr ?? 0) - (a.format.abr ?? 0),
  )[0];
  const audioFormatId = [...selectors].find(
    ([, selector]) => selector === bestAudio?.format.format_id,
  )?.[0];
  return {
    ...(audioFormatId ? { audioFormatId } : {}),
    selectors,
    preferred,
    ...(preview.success ? { previewUrl: preview.data } : {}),
    media: {
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
    },
  };
}

export class YtDlpAnalyzer {
  private active = 0;
  constructor(private readonly config: Environment = env) {}
  async analyze(input: string, context: AnalysisContext): Promise<Analysis> {
    return (await this.analyzeSource(input, context)).media;
  }
  async analyzeSource(input: string, context: AnalysisContext): Promise<AnalyzedSource> {
    const t0 = performance.now();
    const validated = videoUrlSchema.parse(input);
    const tValidation = performance.now() - t0;
    if (this.active >= this.config.ANALYSIS_MAX_CONCURRENT)
      throw new HttpError(
        503,
        'ANALYSIS_BUSY',
        'Video analysis is busy. Please try again shortly.',
      );
    this.active += 1;
    try {
      const url = await resolveTikTokLink(
        validated,
        context.signal,
        this.config.ANALYSIS_TIMEOUT_MS,
      );
      const remainingMs = this.config.ANALYSIS_TIMEOUT_MS - (performance.now() - t0);
      if (remainingMs <= 0)
        throw new HttpError(
          504,
          'ANALYSIS_TIMEOUT',
          'The public video analysis timed out. Please try again later.',
        );
      const tExtractStart = performance.now();
      const result = await runTool(
        this.config.YTDLP_PATH,
        [
          ...publicExtractorOptions,
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
          timeoutMs: Math.max(1, Math.floor(remainingMs)),
          maxOutputBytes: this.config.ANALYSIS_MAX_OUTPUT_BYTES,
        },
        { ...context, stage: 'analysis' },
      );
      const tExtraction = performance.now() - tExtractStart;
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
      const tNormStart = performance.now();
      const source = normalizeSource(payload, url);
      const tNormalization = performance.now() - tNormStart;
      const tTotal = performance.now() - t0;
      context.logger.info(
        {
          requestId: context.requestId,
          validationMs: Math.round(tValidation),
          extractionMs: Math.round(tExtraction),
          normalizationMs: Math.round(tNormalization),
          totalMs: Math.round(tTotal),
          formatCount: source.media.formats.length,
        },
        'Analysis complete',
      );
      return source;
    } finally {
      this.active -= 1;
    }
  }
}
