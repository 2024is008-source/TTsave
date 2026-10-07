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
  const cancel = async (job: { id: string; accessToken?: string | undefined }) => {
    try {
      await transport(`/api/v1/downloads/${job.id}`, {
        method: 'DELETE',
        keepalive: true,
        headers: job.accessToken ? { Authorization: `Bearer ${job.accessToken}` } : {},
      });
    } catch {
      /* Server-side stream disconnect handling and job expiry also clean up. */
    }
  };
  return {
    cancelDownload: cancel,
    async analyze(url, signal) {
      const data = analysisSchema.parse(await read('/analyze', signal, { url }));
      return {
        id: data.id,
        title: data.title,
        creator: data.creator,
        durationSeconds: data.durationSeconds,
        thumbnail: data.thumbnail,
        downloadAvailable: data.downloadAvailable,
        formats: data.formats.map((format) => ({
          id: format.id,
          label: format.qualityLabel,
          container: format.container,
          hasAudio: format.hasAudio,
          ...(format.compatibility === undefined
            ? {}
            : { compatibility: format.compatibility }),
          ...(format.bitrateKbps === undefined
            ? {}
            : { bitrateKbps: format.bitrateKbps }),
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
        await cancel(job);
        signal.throwIfAborted();
      }
      return {
        id: job.id,
        ...(job.accessToken === undefined ? {} : { accessToken: job.accessToken }),
      };
    },
    async waitForDownload(job, signal, report) {
      if (signal.aborted) {
        await cancel(job);
        signal.throwIfAborted();
      }
      let handedOff = false;
      let cancelled = false;
      const onAbort = () => {
        if (!cancelled) {
          cancelled = true;
          void cancel(job);
        }
      };
      signal.addEventListener('abort', onAbort, { once: true });
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        signal.throwIfAborted();
        const response = await transport(`/api/v1/downloads/${job.id}/events`, {
          signal,
          headers: job.accessToken ? { Authorization: `Bearer ${job.accessToken}` } : {},
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
          let boundary = buffer.indexOf('\n\n');
          while (boundary >= 0) {
            if (boundary > 32_768) throw new Error('Invalid download event.');
            const event = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = event
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trimStart())
              .join('\n');
            if (!data) {
              boundary = buffer.indexOf('\n\n');
              continue;
            }
            const update = apiJobSchema.parse(JSON.parse(data) as unknown);
            if (update.id !== job.id) throw new Error('Invalid download event.');
            if (update.status === 'cancelled')
              throw new Error('The download request was cancelled.');
            if (update.mock)
              throw new Error('The mock service does not produce video files.');
            if (update.status === 'error')
              throw new Error(
                update.error?.message ?? 'The video download failed. Please try again.',
              );
            if (update.status === 'expired')
              throw new Error('The download expired. Check the video link again.');
            if (update.status === 'delivered' || update.status === 'delivering')
              throw new Error('This video file has already been requested.');
            if (update.status === 'ready') {
              if (!update.fileUrl?.startsWith(`/api/v1/downloads/${job.id}/file?token=`))
                throw new Error('The file response was invalid.');
              handedOff = true;
              return {
                url: update.fileUrl,
                ...(update.deliveredFormat === undefined
                  ? {}
                  : { qualityLabel: update.deliveredFormat.qualityLabel }),
                ...(update.fileExpiresAt === undefined
                  ? {}
                  : { expiresAt: update.fileExpiresAt }),
                ...(update.progress?.sizeBytes === undefined
                  ? {}
                  : { sizeBytes: update.progress.sizeBytes }),
              };
            }
            report(update.progress ?? {});
            boundary = buffer.indexOf('\n\n');
          }
          if (buffer.length > 32_768) throw new Error('Invalid download event.');
        }
      } finally {
        signal.removeEventListener('abort', onAbort);
        if (!handedOff) onAbort();
        await reader?.cancel().catch(() => undefined);
      }
    },
  };
}
