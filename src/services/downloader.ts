import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, mkdtemp, readdir, lstat, open, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { env, type Environment } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { Analysis, ApiJob } from '../api/contracts.js';
import type { DownloaderService, FileClaim } from './memory-store.js';
import { YtDlpAnalyzer, extractorError, type AnalyzedSource } from './yt-dlp.js';
import { runTool, type AnalysisContext } from './tool-process.js';
import { parseDownloadProgress, PROGRESS_TEMPLATE } from './download-progress.js';
import { HttpError } from '../middleware/error-handler.js';
import { videoUrlSchema } from '../shared/video-url.js';

type MetadataProvider = {
  analyzeSource: (url: string, context: AnalysisContext) => Promise<AnalyzedSource>;
};
type Record = {
  value: ApiJob;
  accessToken: string;
  fileToken: string | null;
  expires: number;
  directory: string | null;
  fileSize: number;
  controller: AbortController;
  listeners: Set<(job: ApiJob) => void>;
  context: AnalysisContext;
  done: Promise<void>;
  cleaning: Promise<void> | null;
  failure: HttpError | null;
  deliveryDone: Promise<void> | null;
  finishDelivery: (() => void) | null;
};
const activeStates = new Set<ApiJob['status']>(['queued', 'downloading']);
const terminalStates = new Set<ApiJob['status']>([
  'delivered',
  'cancelled',
  'error',
  'expired',
]);
const token = () => randomBytes(32).toString('base64url');
const sameToken = (actual: string, supplied: string | undefined) =>
  /^[A-Za-z0-9_-]{43}$/.test(supplied ?? '') &&
  supplied?.length === actual.length &&
  timingSafeEqual(Buffer.from(actual), Buffer.from(supplied));

export class ProductionDownloaderService implements DownloaderService {
  private readonly analyses = new Map<
    string,
    { source: AnalyzedSource; expires: number }
  >();
  private readonly jobs = new Map<string, Record>();
  private activeJobs = 0;
  private activeOperations = 0;
  private stopping = false;
  private root: Promise<string> | null = null;
  private sweeping: Promise<void> | null = null;
  private readonly sweepTimer: ReturnType<typeof setInterval>;
  constructor(
    private readonly analyzer: MetadataProvider = new YtDlpAnalyzer(),
    private readonly config: Environment = env,
  ) {
    this.sweepTimer = setInterval(() => {
      void this.sweep().catch(() =>
        logger.warn({ code: 'CLEANUP_FAILED' }, 'Job sweep will be retried'),
      );
    }, config.JOB_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }
  private acquire() {
    if (this.stopping || this.activeOperations >= this.config.APPLICATION_MAX_CONCURRENT)
      throw new HttpError(
        503,
        'APPLICATION_BUSY',
        'TTSave is busy. Please try again shortly.',
      );
    this.activeOperations += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.activeOperations -= 1;
      }
    };
  }
  async analyze(input: string, context?: AnalysisContext): Promise<Analysis> {
    if (!context) throw new Error('Analysis context is required');
    const url = videoUrlSchema.parse(input);
    const release = this.acquire();
    try {
      const source = await this.analyzer.analyzeSource(url, context);
      context.signal.throwIfAborted();
      const duration = source.media.durationSeconds;
      if (duration === null || duration <= 0)
        throw new HttpError(
          422,
          'DURATION_UNKNOWN',
          'This video’s duration could not be verified.',
        );
      if (duration > this.config.MAX_VIDEO_DURATION_SECONDS)
        throw new HttpError(
          422,
          'VIDEO_TOO_LONG',
          'This video exceeds the supported duration limit.',
        );
      source.media.formats = source.media.formats.filter(
        (format) =>
          source.selectors.has(format.id) &&
          (format.estimatedBytes === undefined ||
            format.estimatedBytes <= this.config.DOWNLOAD_MAX_BYTES),
      );
      if (!source.media.formats.length)
        throw new HttpError(
          422,
          'NO_DELIVERABLE_FORMATS',
          'No supported video format within the download limits is available.',
        );
      source.media.downloadAvailable = true;
      for (const [id, entry] of this.analyses)
        if (entry.expires <= Date.now()) this.analyses.delete(id);
      if (this.analyses.size >= 200)
        throw new HttpError(
          503,
          'SERVICE_CAPACITY',
          'TTSave is busy. Please try again later.',
        );
      this.analyses.set(source.media.id, {
        source,
        expires: Date.now() + this.config.JOB_TTL_MS,
      });
      return structuredClone(source.media);
    } finally {
      release();
    }
  }
  createJob(analysisId: string, formatId: string, context?: AnalysisContext): ApiJob {
    const analysis = this.analyses.get(analysisId);
    if (!analysis || analysis.expires <= Date.now())
      throw new HttpError(
        404,
        'ANALYSIS_NOT_FOUND',
        'The analysis was not found or has expired.',
      );
    const format = analysis.source.media.formats.find(
      (candidate) => candidate.id === formatId,
    );
    const selector = analysis.source.selectors.get(formatId);
    if (!format || !selector || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(selector))
      throw new HttpError(
        400,
        'FORMAT_NOT_FOUND',
        'Choose a format returned by analysis.',
      );
    if (this.activeJobs >= this.config.DOWNLOAD_MAX_CONCURRENT || this.jobs.size >= 200)
      throw new HttpError(
        503,
        'DOWNLOAD_BUSY',
        'Download capacity is full. Please try again shortly.',
      );
    context?.signal.throwIfAborted();
    const release = this.acquire();
    this.activeJobs += 1;
    const controller = new AbortController();
    const value: ApiJob = {
      id: randomUUID(),
      analysisId,
      formatId,
      status: 'queued',
      mock: false,
    };
    const record: Record = {
      value,
      accessToken: token(),
      fileToken: null,
      expires: Date.now() + this.config.JOB_TTL_MS,
      directory: null,
      fileSize: 0,
      controller,
      listeners: new Set(),
      context: {
        signal: controller.signal,
        requestId: context?.requestId ?? randomUUID(),
        logger: context?.logger ?? logger,
      },
      done: Promise.resolve(),
      cleaning: null,
      failure: null,
      deliveryDone: null,
      finishDelivery: null,
    };
    this.jobs.set(value.id, record);
    const abort = () => {
      this.cancelRecord(record);
    };
    context?.signal.addEventListener('abort', abort, { once: true });
    record.done = this.execute(record, analysis.source.media.sourceUrl, selector).finally(
      () => {
        context?.signal.removeEventListener('abort', abort);
        this.activeJobs -= 1;
        release();
      },
    );
    return { ...this.snapshot(record), accessToken: record.accessToken };
  }
  private lookup(id: string): Record {
    const record = this.jobs.get(id);
    if (!record)
      throw new HttpError(
        404,
        'JOB_NOT_FOUND',
        'The download job was not found or has expired.',
      );
    if (
      record.expires <= Date.now() ||
      (record.value.status === 'ready' && (record.value.fileExpiresAt ?? 0) <= Date.now())
    ) {
      this.expire(record);
      throw new HttpError(
        410,
        'JOB_EXPIRED',
        'The download has expired. Check the video link again.',
      );
    }
    return record;
  }
  authorizeJob(id: string, supplied: string | undefined) {
    if (!supplied)
      throw new HttpError(
        401,
        'JOB_ACCESS_REQUIRED',
        'Download authorization is required.',
      );
    if (!sameToken(this.lookup(id).accessToken, supplied))
      throw new HttpError(403, 'JOB_ACCESS_DENIED', 'This download is not authorized.');
  }
  private snapshot(record: Record): ApiJob {
    return structuredClone(record.value);
  }
  getJob(id: string) {
    return this.snapshot(this.lookup(id));
  }
  private publish(record: Record) {
    for (const listener of record.listeners) listener(this.snapshot(record));
  }
  private removeFileAccess(record: Record) {
    record.fileToken = null;
    delete record.value.fileUrl;
    delete record.value.fileExpiresAt;
  }
  cancel(id: string): ApiJob {
    const record = this.lookup(id);
    return this.cancelRecord(record);
  }
  private cancelRecord(record: Record): ApiJob {
    if (terminalStates.has(record.value.status)) return this.snapshot(record);
    record.value.status = 'cancelled';
    this.removeFileAccess(record);
    record.controller.abort();
    this.publish(record);
    void record.done.then(async () => {
      await record.deliveryDone;
      await this.cleanup(record);
    });
    return this.snapshot(record);
  }
  subscribe(id: string, listener: (job: ApiJob) => void) {
    const record = this.lookup(id);
    if (record.listeners.size >= 5)
      throw new HttpError(
        429,
        'TOO_MANY_STREAMS',
        'Too many event connections for this job.',
      );
    record.listeners.add(listener);
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      record.listeners.delete(listener);
      if (!record.listeners.size && activeStates.has(record.value.status))
        this.cancelRecord(record);
    };
  }
  private async temporaryRoot() {
    this.root ??= mkdir(this.config.DOWNLOAD_TEMP_ROOT, {
      recursive: true,
      mode: 0o700,
    }).then(() => realpath(this.config.DOWNLOAD_TEMP_ROOT));
    return this.root;
  }
  private assertDirectory(root: string, directory: string) {
    const relative = path.relative(root, path.resolve(directory));
    if (
      !relative ||
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      relative.includes(path.sep) ||
      !relative.startsWith('job-')
    )
      throw new Error('Unsafe temporary directory');
  }
  private cleanup(record: Record): Promise<void> {
    if (record.cleaning) return record.cleaning;
    if (!record.directory) return Promise.resolve();
    record.cleaning = (async () => {
      const root = await this.temporaryRoot();
      const directory = record.directory;
      if (!directory) return;
      this.assertDirectory(root, directory);
      // The root and leaf are server-created; verify containment before recursive removal.
      const resolved = await realpath(directory).catch(() => null);
      if (resolved) {
        this.assertDirectory(root, resolved);
        await rm(directory, { recursive: true, force: true });
      }
      record.directory = null;
    })()
      .catch(() => {
        record.context.logger.warn(
          {
            requestId: record.context.requestId,
            jobId: record.value.id,
            code: 'CLEANUP_FAILED',
          },
          'Temporary data cleanup will be retried',
        );
      })
      .finally(() => {
        record.cleaning = null;
      });
    return record.cleaning;
  }
  private async directoryBytes(directory: string): Promise<number> {
    let total = 0;
    for (const item of await readdir(directory)) {
      const info = await lstat(path.join(directory, item)).catch(() => null);
      if (!info) continue;
      if (!info.isFile() || info.isSymbolicLink())
        throw new HttpError(
          502,
          'INVALID_DOWNLOAD_FILE',
          'The download produced an unsupported file.',
        );
      total += info.size;
    }
    return total;
  }
  private async execute(record: Record, input: string, selector: string) {
    const deadline = setTimeout(() => {
      record.failure = new HttpError(
        504,
        'DOWNLOAD_TIMEOUT',
        'The download took too long. Please try again.',
      );
      record.controller.abort();
    }, this.config.DOWNLOAD_TIMEOUT_MS);
    deadline.unref();
    let watcher: ReturnType<typeof setInterval> | undefined;
    let checking = false;
    try {
      const root = await this.temporaryRoot();
      record.directory = await mkdtemp(path.join(root, 'job-'));
      record.controller.signal.throwIfAborted();
      record.value.status = 'downloading';
      this.publish(record);
      watcher = setInterval(() => {
        if (checking || !record.directory || record.controller.signal.aborted) return;
        checking = true;
        void this.directoryBytes(record.directory)
          .then((bytes) => {
            if (
              bytes > this.config.DOWNLOAD_MAX_BYTES &&
              activeStates.has(record.value.status)
            )
              throw new HttpError(
                413,
                'VIDEO_TOO_LARGE',
                'This video exceeds the download size limit.',
              );
          })
          .catch((error: unknown) => {
            if (activeStates.has(record.value.status)) {
              record.failure =
                error instanceof HttpError
                  ? error
                  : new HttpError(502, 'DOWNLOAD_FAILED', 'The video download failed.');
              record.controller.abort();
            }
          })
          .finally(() => {
            checking = false;
          });
      }, 250);
      watcher.unref();
      const url = videoUrlSchema.parse(input);
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
          '--no-warnings',
          '--quiet',
          '--progress',
          '--newline',
          '--progress-delta',
          '0.5',
          '--progress-template',
          PROGRESS_TEMPLATE,
          '--socket-timeout',
          '10',
          '--retries',
          '0',
          '--extractor-retries',
          '0',
          '--use-extractors',
          'TikTok,TikTokVM',
          '--format',
          `${selector}[ext=mp4][protocol=https][vcodec!=none][acodec!=none][has_drm!=?true]`,
          '--match-filters',
          `duration > 0 & duration <= ${String(this.config.MAX_VIDEO_DURATION_SECONDS)} & !is_live`,
          '--max-filesize',
          String(this.config.DOWNLOAD_MAX_BYTES),
          '--fixup',
          'never',
          '--paths',
          record.directory,
          '--output',
          'video.mp4',
          '--',
          url,
        ],
        {
          timeoutMs: this.config.DOWNLOAD_TIMEOUT_MS,
          maxOutputBytes: 2_097_152,
          operation: 'download',
          waitForClose: true,
          captureStdout: false,
          onLine: (_stream, line) => {
            const progress = parseDownloadProgress(line, this.config.DOWNLOAD_MAX_BYTES);
            if (progress && !record.controller.signal.aborted) {
              record.value.progress = progress;
              this.publish(record);
            }
          },
        },
        record.context,
      );
      record.controller.signal.throwIfAborted();
      if (result.code !== 0) {
        const failure = extractorError(result.stderr);
        throw failure.code === 'EXTRACTOR_FAILED'
          ? new HttpError(
              502,
              'DOWNLOAD_FAILED',
              'The video download failed. Please try again.',
            )
          : failure;
      }
      const filename = path.join(record.directory, 'video.mp4');
      const info = await lstat(filename);
      if (!info.isFile() || info.isSymbolicLink() || info.size <= 0)
        throw new HttpError(
          502,
          'INVALID_DOWNLOAD_FILE',
          'The download did not produce a supported video file.',
        );
      if (
        info.size > this.config.DOWNLOAD_MAX_BYTES ||
        (await this.directoryBytes(record.directory)) > this.config.DOWNLOAD_MAX_BYTES
      )
        throw new HttpError(
          413,
          'VIDEO_TOO_LARGE',
          'This video exceeds the download size limit.',
        );
      const handle = await open(filename, 'r');
      try {
        const header = Buffer.alloc(12);
        const read = await handle.read(header, 0, 12, 0);
        if (read.bytesRead < 12 || header.subarray(4, 8).toString('ascii') !== 'ftyp')
          throw new HttpError(
            502,
            'INVALID_DOWNLOAD_FILE',
            'The source did not produce an MP4 video.',
          );
      } finally {
        await handle.close();
      }
      record.controller.signal.throwIfAborted();
      record.fileSize = info.size;
      record.fileToken = token();
      record.value.status = 'ready';
      record.value.fileExpiresAt = Math.min(
        record.expires,
        Date.now() + this.config.FILE_ACCESS_TTL_MS,
      );
      record.value.fileUrl = `/api/v1/downloads/${record.value.id}/file?token=${record.fileToken}`;
      record.value.progress = { sizeBytes: info.size };
      this.publish(record);
    } catch (error) {
      if (!terminalStates.has(record.value.status)) {
        const failure =
          record.failure ??
          (error instanceof HttpError
            ? error
            : new HttpError(
                502,
                'DOWNLOAD_FAILED',
                'The video download failed. Please try again.',
              ));
        record.value.status = 'error';
        this.removeFileAccess(record);
        record.value.error = {
          code: failure.code,
          message: failure.message,
          retryable: failure.status >= 500 || failure.status === 429,
          fieldErrors: {},
          requestId: record.context.requestId,
        };
        record.context.logger.warn(
          {
            requestId: record.context.requestId,
            jobId: record.value.id,
            code: failure.code,
          },
          'Download job failed',
        );
        this.publish(record);
      }
    } finally {
      clearTimeout(deadline);
      if (watcher) clearInterval(watcher);
      if (record.value.status !== 'ready') await this.cleanup(record);
    }
  }
  async claimFile(id: string, supplied: string): Promise<FileClaim> {
    const record = this.lookup(id);
    if (record.value.status !== 'ready' || !record.directory)
      throw new HttpError(
        409,
        'FILE_UNAVAILABLE',
        'The video file is not available for delivery.',
      );
    if (!record.fileToken || !sameToken(record.fileToken, supplied))
      throw new HttpError(
        403,
        'FILE_ACCESS_DENIED',
        'This video file is not authorized.',
      );
    const releaseOperation = this.acquire();
    record.deliveryDone = new Promise((resolve) => {
      record.finishDelivery = resolve;
    });
    record.value.status = 'delivering';
    this.removeFileAccess(record);
    const filename = path.join(record.directory, 'video.mp4');
    try {
      const info = await lstat(filename);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.size !== record.fileSize ||
        record.controller.signal.aborted
      )
        throw new Error('File changed before delivery');
    } catch {
      if (!terminalStates.has(record.value.status)) record.value.status = 'error';
      await this.cleanup(record);
      releaseOperation();
      record.finishDelivery?.();
      throw new HttpError(
        409,
        'FILE_UNAVAILABLE',
        'The video file is no longer available.',
      );
    }
    let released = false;
    return {
      path: filename,
      size: record.fileSize,
      signal: record.controller.signal,
      release: async (delivered) => {
        if (released) return;
        released = true;
        record.value.status = delivered ? 'delivered' : 'cancelled';
        record.controller.abort();
        this.publish(record);
        try {
          await this.cleanup(record);
        } finally {
          releaseOperation();
          record.finishDelivery?.();
        }
      },
    };
  }
  private expire(record: Record) {
    record.value.status = 'expired';
    this.removeFileAccess(record);
    record.controller.abort();
    this.publish(record);
    void record.done.then(async () => {
      await record.deliveryDone;
      await this.cleanup(record);
    });
  }
  sweep(): Promise<void> {
    if (this.sweeping) return this.sweeping;
    this.sweeping = (async () => {
      for (const [id, entry] of this.analyses)
        if (entry.expires <= Date.now()) this.analyses.delete(id);
      for (const [id, record] of this.jobs) {
        const expired =
          record.expires <= Date.now() ||
          (record.value.status === 'ready' &&
            (record.value.fileExpiresAt ?? 0) <= Date.now());
        if (expired && !terminalStates.has(record.value.status)) this.expire(record);
        if (terminalStates.has(record.value.status)) {
          await record.done;
          await record.deliveryDone;
          await this.cleanup(record);
        }
        if (expired && !record.directory) this.jobs.delete(id);
      }
      {
        const root = await this.temporaryRoot();
        const owned = new Set([...this.jobs.values()].map((record) => record.directory));
        for (const name of await readdir(root)) {
          if (!name.startsWith('job-')) continue;
          const directory = path.join(root, name);
          if (owned.has(directory)) continue;
          const info = await lstat(directory);
          if (
            !info.isDirectory() ||
            info.isSymbolicLink() ||
            Date.now() - info.mtimeMs < this.config.JOB_TTL_MS
          )
            continue;
          this.assertDirectory(root, await realpath(directory));
          await rm(directory, { recursive: true, force: true });
        }
      }
    })().finally(() => {
      this.sweeping = null;
    });
    return this.sweeping;
  }
  async dispose() {
    this.stopping = true;
    clearInterval(this.sweepTimer);
    for (const record of this.jobs.values()) {
      if (!terminalStates.has(record.value.status)) {
        record.value.status = 'cancelled';
        this.removeFileAccess(record);
        record.controller.abort();
        this.publish(record);
      }
    }
    await Promise.all(
      [...this.jobs.values()].map(async (record) => {
        await record.done;
        await record.deliveryDone;
        await this.cleanup(record);
      }),
    );
    this.analyses.clear();
    this.jobs.clear();
  }
}
