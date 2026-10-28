import type { Analysis, ApiJob } from '../api/contracts.js';
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
    photoIds?: string[],
  ): ApiJob;
  getJob(id: string): ApiJob;
  cancel(id: string): ApiJob;
  subscribe(id: string, listener: (job: ApiJob) => void): () => void;
  authorizeJob?: (id: string, token: string | undefined) => void;
  claimFile?: (id: string, token: string) => Promise<FileClaim>;
  sweep?: () => Promise<void>;
  dispose?: () => Promise<void>;
  metrics?: () => {
    activeJobs: number;
    activeAnalyses: number;
    activeArchives: number;
    storedJobs: number;
    preparedBytes: number;
  };
  getThumbnail?: (id: string, token: string) => Promise<Buffer>;
  getPhotoPreview?: (
    id: string,
    photoId: string,
    token: string,
    signal: AbortSignal,
  ) => Promise<{ bytes: Buffer; contentType: string }>;
};
