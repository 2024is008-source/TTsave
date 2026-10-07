import { analysisSchema, apiErrorSchema, apiJobSchema } from '../api/contracts.js';
import type { DownloaderAdapter } from './contracts.js';

/** Only the server supplies media and job information. */
export function createApiAdapter(transport: typeof fetch = fetch): DownloaderAdapter {
  const read = async (path: string, signal: AbortSignal, body?: unknown) => {
    const response = await transport(`/api/v1${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const error = apiErrorSchema.safeParse(payload);
      throw new Error(
        error.success
          ? error.data.error.message
          : 'The API request failed. Please try again.',
      );
    }
    return payload;
  };
  const cancel = async (id: string) => {
    try {
      await transport(`/api/v1/downloads/${id}`, { method: 'DELETE', keepalive: true });
    } catch {
      /* Cleanup is best effort; the server also expires mock jobs. */
    }
  };
  return {
    async analyze(url, signal) {
      const data = analysisSchema.parse(await read('/analyze', signal, { url }));
      return {
        id: data.id,
        title: data.title,
        downloadAvailable: data.downloadAvailable,
        formats: data.formats.map((format) => ({
          id: format.id,
          label: format.qualityLabel,
          ...(format.width === undefined ? {} : { width: format.width }),
          ...(format.height === undefined ? {} : { height: format.height }),
          ...(format.estimatedBytes === undefined
            ? {}
            : { sizeBytes: format.estimatedBytes }),
        })),
      };
    },
    async startDownload(analysisId, formatId, signal) {
      const job = apiJobSchema.parse(
        await read('/downloads', signal, { analysisId, formatId }),
      );
      if (signal.aborted) {
        await cancel(job.id);
        signal.throwIfAborted();
      }
      return { id: job.id };
    },
    async waitForDownload(job, signal) {
      if (signal.aborted) {
        await cancel(job.id);
        signal.throwIfAborted();
      }
      const onAbort = () => {
        void cancel(job.id);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        signal.throwIfAborted();
        const response = await transport(`/api/v1/downloads/${job.id}/events`, {
          signal,
        });
        if (!response.ok) {
          const error = apiErrorSchema.safeParse(await response.json());
          throw new Error(
            error.success ? error.data.error.message : 'Unable to read download events.',
          );
        }
        if (!response.body) throw new Error('Download events are unavailable.');
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done)
            throw new Error('Download events ended before a file was available.');
          buffer += decoder.decode(chunk.value, { stream: true });
          if (buffer.length > 32_768) throw new Error('Invalid download event.');
          const boundary = buffer.indexOf('\n\n');
          if (boundary < 0) continue;
          const event = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = event
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          if (!data) continue;
          const update = apiJobSchema.parse(JSON.parse(data) as unknown);
          if (update.id !== job.id) throw new Error('Invalid download event.');
          if (update.status === 'cancelled')
            throw new Error('The download request was cancelled.');
          // This contract mock explicitly reports that it produces no files.
          // Never simulate a ready file or invent progress to finish the UI.
          await cancel(job.id);
          throw new Error('The mock service does not produce video files.');
        }
      } finally {
        signal.removeEventListener('abort', onAbort);
        await reader?.cancel().catch(() => undefined);
      }
    },
  };
}
