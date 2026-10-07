import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiAdapter } from '../src/frontend/api-adapter.js';

const id = randomUUID();
const accessToken = 'a'.repeat(43);
const fileUrl = `/api/v1/downloads/${id}/file?token=${'b'.repeat(43)}`;
const base = { id, analysisId: randomUUID(), formatId: 'source-1', mock: false };
it('reads multiple structured SSE events and preserves real progress and authorized URLs', async () => {
  const queued = { ...base, status: 'queued', accessToken };
  const events = [
    { ...base, status: 'downloading', progress: {} },
    {
      ...base,
      status: 'downloading',
      progress: { percent: 25, speedBytesPerSecond: 256, sizeBytes: 1024 },
    },
    {
      ...base,
      status: 'ready',
      fileUrl,
      fileExpiresAt: Date.now() + 60_000,
      progress: { sizeBytes: 1024 },
      deliveredFormat: {
        id: 'source-1',
        container: 'mp4',
        qualityLabel: '576p',
        width: 576,
        height: 1024,
        hasAudio: true,
      },
    },
  ];
  const fetcher = vi.fn<typeof fetch>((url) =>
    Promise.resolve(
      typeof url === 'string' && url.endsWith('/events')
        ? new Response(
            events.map((job) => `event: job\ndata: ${JSON.stringify(job)}\n\n`).join(''),
            { headers: { 'Content-Type': 'text/event-stream' } },
          )
        : Response.json(queued),
    ),
  );
  const adapter = createApiAdapter(fetcher);
  const job = await adapter.startDownload(
    base.analysisId,
    base.formatId,
    new AbortController().signal,
  );
  expect(job.accessToken).toBe(accessToken);
  const report = vi.fn<(progress: unknown) => void>();
  await expect(
    adapter.waitForDownload(job, new AbortController().signal, report),
  ).resolves.toEqual({
    url: fileUrl,
    expiresAt: expect.any(Number),
    qualityLabel: '576p',
    sizeBytes: 1024,
  });
  expect(report.mock.calls.map(([value]: [unknown]) => value)).toEqual([
    {},
    { percent: 25, speedBytesPerSecond: 256, sizeBytes: 1024 },
  ]);
  expect(fetcher).toHaveBeenCalledWith(
    `/api/v1/downloads/${id}/events`,
    expect.objectContaining({ headers: { Authorization: `Bearer ${accessToken}` } }),
  );
  expect(fetcher.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(
    false,
  );
});
it('sends authorized cancellation after aborted job creation', async () => {
  const controller = new AbortController();
  const fetcher = vi.fn<typeof fetch>(() => {
    controller.abort();
    return Promise.resolve(Response.json({ ...base, status: 'queued', accessToken }));
  });
  await expect(
    createApiAdapter(fetcher).startDownload(
      base.analysisId,
      base.formatId,
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledWith(
    `/api/v1/downloads/${id}`,
    expect.objectContaining({
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
});
it('announces a safe job failure and cancels after an interrupted event stream', async () => {
  const failure = {
    ...base,
    status: 'error',
    error: {
      code: 'DOWNLOAD_TIMEOUT',
      message: 'The download took too long.',
      retryable: true,
      fieldErrors: {},
      requestId: 'request',
    },
  };
  const fetcher = vi.fn<typeof fetch>((url) =>
    Promise.resolve(
      typeof url === 'string' && url.endsWith('/events')
        ? new Response(`event: job\ndata: ${JSON.stringify(failure)}\n\n`)
        : Response.json(base),
    ),
  );
  await expect(
    createApiAdapter(fetcher).waitForDownload(
      { id, accessToken },
      new AbortController().signal,
      vi.fn(),
    ),
  ).rejects.toThrow('The download took too long.');
  expect(fetcher).toHaveBeenCalledWith(
    `/api/v1/downloads/${id}`,
    expect.objectContaining({
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
});
