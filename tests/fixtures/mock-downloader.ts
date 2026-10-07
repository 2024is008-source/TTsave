import { randomUUID } from 'node:crypto';
import {
  InMemoryJobStore,
  type DownloaderService,
} from '../../src/services/memory-store.js';
import type { Analysis } from '../../src/api/contracts.js';

/** Explicit contract fixtures, confined to automated tests. */
export class MockDownloaderService extends InMemoryJobStore implements DownloaderService {
  analyze(url: string): Analysis {
    return this.storeAnalysis({
      id: randomUUID(),
      title: 'Mock API preview — not analyzed TikTok content',
      creator: null,
      thumbnail: null,
      durationSeconds: null,
      sourceUrl: url,
      formats: [
        {
          id: 'mock-mp4',
          container: 'mp4',
          qualityLabel: 'Mock format — file unavailable',
          hasAudio: false,
        },
      ],
      mock: true,
      downloadAvailable: true,
    });
  }
}
