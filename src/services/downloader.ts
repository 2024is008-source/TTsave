import { InMemoryJobStore, type DownloaderService } from './memory-store.js';
import { YtDlpAnalyzer } from './yt-dlp.js';
import type { AnalysisContext } from './tool-process.js';
import { HttpError } from '../middleware/error-handler.js';

export class ProductionDownloaderService
  extends InMemoryJobStore
  implements DownloaderService
{
  constructor(private readonly analyzer = new YtDlpAnalyzer()) {
    super();
  }
  async analyze(url: string, context?: AnalysisContext) {
    if (!context) throw new Error('Analysis context is required');
    const media = await this.analyzer.analyze(url, context);
    context.signal.throwIfAborted();
    return this.storeAnalysis(media);
  }
  override createJob(): never {
    throw new HttpError(
      503,
      'DOWNLOADER_UNAVAILABLE',
      'Video file downloads are not available yet.',
    );
  }
}
