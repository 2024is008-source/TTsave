import { z } from 'zod';

import { mediaSchema, type DownloaderAdapter } from './contracts.js';

const errorEnvelope = z.object({
  error: z.object({ message: z.string().min(1).max(1000) }),
});

/** The existing backend stub is the only source of preview availability messages.
 * No media, quality, sizes or progress are invented here. Replace this adapter
 * when the real analysis and download API has been implemented.
 */
export function createMockAdapter(transport: typeof fetch = fetch): DownloaderAdapter {
  return {
    async analyze(url, signal) {
      const response = await transport('/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal,
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const error = errorEnvelope.safeParse(payload);
        throw new Error(
          error.success
            ? error.data.error.message
            : 'Unable to analyze this video. Please try again.',
        );
      }
      return mediaSchema.parse(payload);
    },
    startDownload(_mediaId, _formatId, signal) {
      signal.throwIfAborted();
      return Promise.reject(new Error('Downloads are not available yet.'));
    },
    waitForDownload(_job, signal) {
      signal.throwIfAborted();
      return Promise.reject(new Error('Downloads are not available yet.'));
    },
  };
}
