import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { PassThrough } from 'node:stream';
import request from 'supertest';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { apiJobSchema, analysisSchema } from '../../src/api/contracts.js';
import { ProductionDownloaderService } from '../../src/services/downloader.js';
import { parseEnvironment } from '../../src/config/env.js';
import { PreviewStore } from '../../src/services/previews.js';
import {
  downloadChild,
  sourceFixture,
  publicUrl,
  mp4Fixture,
  probeChild,
} from '../fixtures/download.js';

const spawnMock = vi.hoisted(() =>
  vi.fn<(executable: string, args: string[], options: unknown) => unknown>(),
);
const streamMock = vi.hoisted(() => vi.fn<(filename: string) => unknown>());
vi.mock('node:child_process', () => ({ spawn: spawnMock }));
vi.mock('node:fs', async (original) => ({
  ...(await original<typeof import('node:fs')>()),
  createReadStream: streamMock,
}));
let root: string;
let service: ProductionDownloaderService;
let app: ReturnType<typeof createApp>;
let server: Server | undefined;
const children: ReturnType<typeof downloadChild>[] = [];
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'tiksavemp4-http-test-'));
  service = new ProductionDownloaderService(
    { analyzeSource: () => Promise.resolve(sourceFixture()) },
    parseEnvironment({ DOWNLOAD_TEMP_ROOT: root }),
  );
  app = createApp(service);
  children.length = 0;
  spawnMock.mockImplementation((_executable, args) => {
    if (_executable === 'ffprobe') return probeChild();
    const child = downloadChild(args);
    children.push(child);
    return child;
  });
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  streamMock.mockImplementation((filename) => fs.createReadStream(filename));
});
afterEach(async () => {
  await service.dispose();
  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
    });
    server = undefined;
  }
  spawnMock.mockReset();
  streamMock.mockReset();
  vi.restoreAllMocks();
  if (
    path.dirname(root) !== path.resolve(tmpdir()) ||
    !path.basename(root).startsWith('tiksavemp4-http-test-')
  )
    throw new Error('Unsafe test cleanup directory');
  await rm(root, { recursive: true, force: true });
});
async function start() {
  const analysis = await request(app)
    .post('/api/v1/analyze')
    .send({ url: publicUrl })
    .expect(200);
  const media = analysisSchema.parse(analysis.body as unknown);
  const result = await request(app)
    .post('/api/v1/downloads')
    .send({ analysisId: media.id, formatId: 'source-1' })
    .expect(201);
  const job = apiJobSchema.parse(result.body as unknown);
  await vi.waitFor(() => expect(children).toHaveLength(1));
  const child = children[0];
  if (!child) throw new Error('Missing test child');
  return { media, job, child, authorization: `Bearer ${job.accessToken ?? ''}` };
}
async function ready() {
  const started = await start();
  await started.child.complete();
  await vi.waitFor(() => expect(service.getJob(started.job.id).status).toBe('ready'));
  return started;
}
async function address() {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const details = server.address();
  if (!details || typeof details === 'string')
    throw new Error('Missing test server port');
  return `http://127.0.0.1:${String(details.port)}`;
}
describe('production download endpoints', () => {
  it('returns a local authorized thumbnail and rejects arbitrary thumbnail URLs, wrong tokens and expired previews', async () => {
    await service.dispose();
    const config = parseEnvironment({ DOWNLOAD_TEMP_ROOT: root });
    const image = await sharp({
      create: { width: 90, height: 160, channels: 3, background: '#5588cc' },
    })
      .png()
      .toBuffer();
    const previews = new PreviewStore(config, () => Promise.resolve(image));
    service = new ProductionDownloaderService(
      {
        analyzeSource: () =>
          Promise.resolve({
            ...sourceFixture(),
            previewUrl: 'https://p16.tiktokcdn.com/source.jpeg?secret=private',
          }),
      },
      config,
      previews,
    );
    app = createApp(service);
    const response = await request(app)
      .post('/api/v1/analyze')
      .send({ url: publicUrl })
      .expect(200);
    const media = analysisSchema.parse(response.body as unknown);
    if (!media.thumbnail) throw new Error('Missing local preview');
    expect(media.thumbnail).toMatch(/^\/api\/v1\/analysis\//);
    expect(response.text).not.toMatch(/tiktokcdn|secret|private/);
    const preview = await request(app)
      .get(media.thumbnail)
      .expect(200)
      .expect('Content-Type', /image\/webp/);
    expect(preview.headers['cache-control']).toBe('private, no-store');
    await request(app)
      .get(media.thumbnail.replace(/token=.*/, `token=${'x'.repeat(43)}`))
      .expect(403);
    await request(app)
      .get(media.thumbnail + '&url=https://localhost')
      .expect(400);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + config.JOB_TTL_MS + 1);
    await request(app).get(media.thumbnail).expect(404);
    await service.sweep();
  });
  it('requires the job capability for lookup, SSE and cancellation', async () => {
    const { job, authorization } = await start();
    for (const suffix of ['', '/events'])
      await request(app).get(`/api/v1/downloads/${job.id}${suffix}`).expect(401);
    await request(app).delete(`/api/v1/downloads/${job.id}`).expect(401);
    await request(app)
      .get(`/api/v1/downloads/${job.id}`)
      .set('Authorization', `Bearer ${'x'.repeat(43)}`)
      .expect(403);
    const lookup = await request(app)
      .get(`/api/v1/downloads/${job.id}`)
      .set('Authorization', authorization)
      .expect(200);
    expect(apiJobSchema.parse(lookup.body as unknown).accessToken).toBeUndefined();
    await request(app)
      .delete(`/api/v1/downloads/${job.id}`)
      .set('Authorization', authorization)
      .expect(200);
    await service.sweep();
  });
  it('rejects client-selected paths, filenames and unreturned formats', async () => {
    const { media, job, authorization } = await start();
    await request(app)
      .post('/api/v1/downloads')
      .send({
        analysisId: media.id,
        formatId: 'source-1',
        path: 'C:/anywhere',
        filename: 'evil.mp4',
      })
      .expect(400);
    await request(app)
      .post('/api/v1/downloads')
      .send({ analysisId: media.id, formatId: 'fake' })
      .expect(400);
    await request(app)
      .delete(`/api/v1/downloads/${job.id}`)
      .set('Authorization', authorization)
      .expect(200);
  });
  it('serves one authorized completed file with a safe filename and deletes its data', async () => {
    const { job, child } = await ready();
    const file = service.getJob(job.id).fileUrl ?? '';
    await request(app)
      .get(`/api/v1/downloads/${job.id}/file?token=${'x'.repeat(43)}`)
      .expect(403);
    await request(app).head(file).expect(405);
    await request(app).get(file).set('Range', 'bytes=0-10').expect(416);
    const response = await request(app).get(file).buffer(true).expect(200);
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="TikSaveMp4-video.mp4"',
    );
    expect(response.headers['content-type']).toBe('video/mp4');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toEqual(mp4Fixture);
    await vi.waitFor(() => expect(service.getJob(job.id).status).toBe('delivered'));
    await service.sweep();
    await expect(access(child.directory)).rejects.toThrow();
    await request(app).get(file).expect(409);
  });
  it('streams initial state, unknown totals, measured progress and readiness', async () => {
    const { job, child, authorization } = await start();
    const base = await address();
    const events = await fetch(`${base}/api/v1/downloads/${job.id}/events`, {
      headers: { Authorization: authorization },
    });
    expect(events.status).toBe(200);
    expect(events.headers.get('content-type')).toContain('text/event-stream');
    expect(events.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    child.stdout.write(
      'TikSaveMp4:{"downloadedBytes":16,"totalBytes":null,"speedBytesPerSecond":null}\n',
    );
    child.stdout.write(
      'TikSaveMp4:{"downloadedBytes":16,"totalBytes":32,"speedBytesPerSecond":128}\n',
    );
    await child.complete();
    const text = await events.text();
    expect(text).toContain('event: job\n');
    expect(text).toContain('"progress":{"downloadedBytes":16}');
    expect(text).toContain('"percent":50');
    expect(text).toContain('"status":"ready"');
    expect(text).not.toContain(root);
    expect(text).not.toContain(job.accessToken);
  });
  it('cancels the process and removes temporary files on browser SSE disconnect', async () => {
    const { job, child, authorization } = await start();
    const base = await address();
    const events = await fetch(`${base}/api/v1/downloads/${job.id}/events`, {
      headers: { Authorization: authorization },
    });
    await events.body?.cancel();
    await vi.waitFor(() => expect(service.getJob(job.id).status).toBe('cancelled'));
    await service.sweep();
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    await expect(access(child.directory)).rejects.toThrow();
  });
  it('cleans up a file transfer when the browser disconnects', async () => {
    const { job, child } = await ready();
    streamMock.mockImplementationOnce(() => {
      const slow = new PassThrough();
      queueMicrotask(() => slow.write(mp4Fixture.subarray(0, 12)));
      return slow;
    });
    const base = await address();
    const response = await fetch(`${base}${service.getJob(job.id).fileUrl ?? ''}`);
    await response.body?.cancel();
    await vi.waitFor(() => expect(service.getJob(job.id).status).toBe('cancelled'));
    await service.sweep();
    await expect(access(child.directory)).rejects.toThrow();
  });
});
