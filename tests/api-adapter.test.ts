import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApiAdapter } from '../src/frontend/api-adapter.js';

it('sends selected opaque photo IDs and capability without source data', async () => {
  const analysisId = randomUUID();
  const photoIds = [randomUUID(), randomUUID()];
  const transport = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      Response.json({
        id: randomUUID(),
        analysisId,
        formatId: photoIds[0],
        downloadType: 'image',
        status: 'queued',
        mock: false,
        accessToken: 'b'.repeat(43),
      }),
    ),
  );
  await createApiAdapter(transport).startDownload(
    analysisId,
    photoIds[0] ?? '',
    new AbortController().signal,
    'image',
    'a'.repeat(43),
    photoIds,
  );
  const options = transport.mock.calls[0]?.[1];
  if (typeof options?.body !== 'string') throw new Error('Missing JSON request');
  expect(JSON.parse(options.body)).toEqual({
    analysisId,
    photoIds,
    downloadType: 'image',
    capability: 'a'.repeat(43),
  });
});

it('handles HTML proxy failures without exposing parser text or response bodies', async () => {
  const transport = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response('<html>secret signed-url /private/path</html>', { status: 502 }),
    ),
  );
  const adapter = createApiAdapter(transport);
  await expect(
    adapter.analyze('https://vt.tiktok.com/abc/', new AbortController().signal),
  ).rejects.toThrow(
    'The service returned an unreadable response. Please try again later.',
  );
  await expect(
    adapter.waitForDownload(
      { id: randomUUID() },
      new AbortController().signal,
      () => undefined,
    ),
  ).rejects.toThrow('Unable to read download events.');
});

it('submits MP3 intent without the saved MP4 selection or source URL', async () => {
  const analysisId = randomUUID();
  const jobId = randomUUID();
  const fetcher = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      Response.json({
        id: jobId,
        analysisId,
        formatId: 'source-audio',
        downloadType: 'mp3',
        status: 'queued',
        mock: false,
      }),
    ),
  );
  await createApiAdapter(fetcher).startDownload(
    analysisId,
    'previous-video-quality',
    new AbortController().signal,
    'mp3',
  );
  expect(fetcher).toHaveBeenCalledWith(
    '/api/v1/downloads',
    expect.objectContaining({
      body: JSON.stringify({ analysisId, downloadType: 'mp3' }),
    }),
  );
});

it('maps only API formats and known metrics into the frontend model', async () => {
  const id = randomUUID();
  const fetcher = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      Response.json({
        id,
        title: 'Mock',
        creator: null,
        thumbnail: null,
        durationSeconds: null,
        sourceUrl: 'https://vt.tiktok.com/abc/',
        formats: [
          {
            id: 'source',
            container: 'mp4',
            qualityLabel: 'API format',
            hasAudio: true,
            width: 720,
            height: 1280,
            estimatedBytes: 2048,
          },
        ],
        mock: true,
      }),
    ),
  );
  const signal = new AbortController().signal;
  const media = await createApiAdapter(fetcher).analyze(
    'https://vt.tiktok.com/abc/',
    signal,
  );
  expect(media.formats).toEqual([
    {
      id: 'source',
      label: 'API format',
      container: 'mp4',
      hasAudio: true,
      width: 720,
      height: 1280,
      sizeBytes: 2048,
    },
  ]);
  expect(fetcher).toHaveBeenCalledWith(
    '/api/v1/analyze',
    expect.objectContaining({ signal, method: 'POST' }),
  );
});
it('uses safe API errors and rejects mock jobs instead of inventing a file', async () => {
  const id = randomUUID();
  const job = {
    id,
    analysisId: randomUUID(),
    formatId: 'mock-mp4',
    status: 'queued',
    mock: true,
  };
  const fetcher = vi.fn<typeof fetch>((path) => {
    if (typeof path === 'string' && path.endsWith('/events'))
      return Promise.resolve(
        new Response(`event: job\ndata: ${JSON.stringify(job)}\n\n`, {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );
    return Promise.resolve(Response.json(job));
  });
  const report = vi.fn();
  await expect(
    createApiAdapter(fetcher).waitForDownload(
      { id },
      new AbortController().signal,
      report,
    ),
  ).rejects.toThrow('mock service does not produce video files');
  expect(report).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledWith(
    `/api/v1/downloads/${id}`,
    expect.objectContaining({ method: 'DELETE' }),
  );
  const failed = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      Response.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Please try later.',
            retryable: true,
            fieldErrors: {},
            requestId: randomUUID(),
          },
        },
        { status: 429 },
      ),
    ),
  );
  await expect(
    createApiAdapter(failed).analyze(
      'https://vt.tiktok.com/abc/',
      new AbortController().signal,
    ),
  ).rejects.toThrow('Please try later.');
});
