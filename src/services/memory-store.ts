import { randomUUID } from 'node:crypto';
import type { Analysis, ApiJob } from '../api/contracts.js';
import { HttpError } from '../middleware/error-handler.js';
import type { AnalysisContext } from './tool-process.js';
export type FileClaim = {
  contentType?: string;
  filename?: string;
  path: string;
  size: number;
  signal: AbortSignal;
  release: (delivered: boolean) => Promise<void>;
};

export type DownloaderService = {
  analyze(url: string, context?: AnalysisContext): Analysis | Promise<Analysis>;
  createJob(
    analysisId: string,
    formatId: string,
    context?: AnalysisContext,
    downloadType?: 'mp4' | 'mp3' | 'image',
    capability?: string,
  ): ApiJob;
  getJob(id: string): ApiJob;
  cancel(id: string): ApiJob;
  subscribe(id: string, listener: (job: ApiJob) => void): () => void;
  authorizeJob?: (id: string, token: string | undefined) => void;
  claimFile?: (id: string, token: string) => Promise<FileClaim>;
  sweep?: () => Promise<void>;
  dispose?: () => Promise<void>;
  getThumbnail?: (id: string, token: string) => Promise<Buffer>;
  getPhotoPreview?: (
    id: string,
    photoId: string,
    token: string,
    signal: AbortSignal,
  ) => Promise<{ bytes: Buffer; contentType: string }>;
};

/** Bounded analysis and job storage; no timers simulate work or completion. */
export class InMemoryJobStore {
  private analyses = new Map<string, { value: Analysis; expires: number }>();
  private jobs = new Map<string, { value: ApiJob; expires: number }>();
  private listeners = new Map<string, Set<(job: ApiJob) => void>>();
  private readonly ttl = 30 * 60_000;
  private prune() {
    const now = Date.now();
    for (const [id, entry] of this.analyses)
      if (entry.expires <= now) this.analyses.delete(id);
    for (const [id, entry] of this.jobs) {
      if (entry.expires <= now && !this.listeners.has(id)) this.jobs.delete(id);
    }
  }
  private capacity(size: number) {
    if (size >= 200)
      throw new HttpError(
        503,
        'SERVICE_CAPACITY',
        'The preview is busy. Please try again later.',
      );
  }
  protected storeAnalysis(value: Analysis): Analysis {
    this.prune();
    this.capacity(this.analyses.size);
    this.analyses.set(value.id, { value, expires: Date.now() + this.ttl });
    return structuredClone(value);
  }
  createJob(analysisId: string, formatId: string): ApiJob {
    this.prune();
    const analysis = this.analyses.get(analysisId)?.value;
    if (!analysis)
      throw new HttpError(
        404,
        'ANALYSIS_NOT_FOUND',
        'The analysis was not found or has expired.',
      );
    if (!analysis.formats.some((format) => format.id === formatId))
      throw new HttpError(
        400,
        'FORMAT_NOT_FOUND',
        'Choose a format returned by analysis.',
      );
    this.capacity(this.jobs.size);
    const value: ApiJob = {
      id: randomUUID(),
      analysisId,
      formatId,
      status: 'queued',
      mock: true,
    };
    this.jobs.set(value.id, { value, expires: Date.now() + this.ttl });
    return structuredClone(value);
  }
  getJob(id: string): ApiJob {
    this.prune();
    const job = this.jobs.get(id)?.value;
    if (!job)
      throw new HttpError(
        404,
        'JOB_NOT_FOUND',
        'The download job was not found or has expired.',
      );
    return structuredClone(job);
  }
  cancel(id: string): ApiJob {
    const job = this.getJob(id);
    job.status = 'cancelled';
    this.jobs.set(id, { value: job, expires: Date.now() + this.ttl });
    for (const listener of this.listeners.get(id) ?? []) listener(structuredClone(job));
    return structuredClone(job);
  }
  subscribe(id: string, listener: (job: ApiJob) => void) {
    this.getJob(id);
    const listeners = this.listeners.get(id) ?? new Set<(job: ApiJob) => void>();
    if (listeners.size >= 5)
      throw new HttpError(
        429,
        'TOO_MANY_STREAMS',
        'Too many event connections for this job.',
      );
    listeners.add(listener);
    this.listeners.set(id, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(id);
    };
  }
}
