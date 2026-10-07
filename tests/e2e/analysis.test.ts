import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { analysisSchema, apiErrorSchema } from '../../src/api/contracts.js';

const spawnMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());
vi.mock('node:child_process', () => ({ spawn: spawnMock }));
afterEach(() => spawnMock.mockReset());
const url = 'https://www.tiktok.com/@creator/video/123';
function childProcess() {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
}
it('uses the production adapter and returns only normalized metadata over HTTP', async () => {
  spawnMock.mockImplementation(() => {
    const child = childProcess();
    queueMicrotask(() => {
      child.stdout.write(
        JSON.stringify({
          extractor_key: 'TikTok',
          title: 'Public source',
          uploader: 'Creator',
          duration: 5,
          availability: 'public',
          formats: [
            {
              format_id: 'download-0',
              ext: 'mp4',
              protocol: 'https',
              url: 'https://video.tiktokcdn.com/file.mp4',
              vcodec: 'h264',
              acodec: 'aac',
            },
          ],
          secret: 'raw internal value',
        }),
      );
      child.emit('close', 0);
    });
    return child;
  });
  const app = createApp();
  const response = await request(app).post('/api/v1/analyze').send({ url }).expect(200);
  const media = analysisSchema.parse(response.body as unknown);
  expect(media).toMatchObject({
    title: 'Public source',
    creator: 'Creator',
    mock: false,
    downloadAvailable: true,
  });
  expect(response.text).not.toMatch(/secret|tiktokcdn|raw internal/);
});
it('returns a safe extractor error with a matching request ID', async () => {
  spawnMock.mockImplementation(() => {
    const child = childProcess();
    queueMicrotask(() => {
      child.stderr.write('Private video: secret traceback and /private/path');
      child.emit('close', 1);
    });
    return child;
  });
  const response = await request(createApp())
    .post('/api/v1/analyze')
    .send({ url })
    .expect(422);
  expect(apiErrorSchema.parse(response.body as unknown).error).toMatchObject({
    code: 'VIDEO_NOT_PUBLIC',
    requestId: response.headers['x-request-id'],
    retryable: false,
  });
  expect(response.text).not.toMatch(/secret|traceback|\/private\/path/);
});
it('kills analysis after an HTTP client disconnect', async () => {
  const child = childProcess();
  let started!: () => void;
  const launched = new Promise<void>((resolve) => {
    started = resolve;
  });
  spawnMock.mockImplementation(() => {
    started();
    return child;
  });
  const pending = request(createApp()).post('/api/v1/analyze').send({ url });
  pending.end(() => undefined);
  await launched;
  pending.abort();
  await vi.waitFor(() => expect(child.kill).toHaveBeenCalledWith('SIGKILL'));
});
it('reports missing startup dependencies as not ready while health stays live', async () => {
  const app = createApp(undefined, () => false);
  await request(app).get('/health').expect(200);
  const response = await request(app).get('/ready').expect(503);
  expect(response.body).toEqual({ status: 'not-ready' });
});
