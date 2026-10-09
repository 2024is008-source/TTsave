import { access, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { ProductionDownloaderService } from '../../src/services/downloader.js';
import { parseEnvironment } from '../../src/config/env.js';
import { apiJobSchema, analysisSchema } from '../../src/api/contracts.js';
import {
  sourceFixture,
  downloadChild,
  probeChild,
  publicUrl,
} from '../fixtures/download.js';

const spawnMock = vi.hoisted(() =>
  vi.fn<(executable: string, args: string[], options: unknown) => unknown>(),
);
vi.mock('node:child_process', () => ({ spawn: spawnMock }));
let root: string;
let service: ProductionDownloaderService;
let app: ReturnType<typeof createApp>;
let download: ReturnType<typeof downloadChild> | undefined;
let conversion: ReturnType<typeof converter> | undefined;
let conversionMode: 'success' | 'failure' | 'pending';
let invalidProbe: boolean;
const metadata = { analyzeSource: vi.fn(() => Promise.resolve(sourceFixture())) };
function converter(args: string[]) {
  const output = args.at(-1);
  if (!output) throw new Error('Missing output');
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit('close', null));
      return true;
    }),
  });
  if (conversionMode !== 'pending')
    void writeFile(output, 'ID3-test-audio').then(() => {
      child.stderr.write('secret signed-url cookie=private');
      child.emit('close', conversionMode === 'failure' ? 1 : 0);
    });
  return child;
}
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'tiksavemp4-mp3-test-'));
  conversionMode = 'success';
  invalidProbe = false;
  download = undefined;
  conversion = undefined;
  metadata.analyzeSource.mockImplementation(() => Promise.resolve(sourceFixture()));
  service = new ProductionDownloaderService(
    metadata,
    parseEnvironment({
      DOWNLOAD_TEMP_ROOT: root,
      DOWNLOAD_TIMEOUT_MS: '1000',
      DOWNLOAD_MAX_CONCURRENT: '1',
    }),
    undefined,
    true,
  );
  app = createApp(service);
  spawnMock.mockImplementation((executable, args) => {
    if (executable === 'ffmpeg') {
      conversion = converter(args);
      return conversion;
    }
    if (executable === 'ffprobe')
      return args.at(-1)?.endsWith('.mp3')
        ? probeChild({
            streams: [{ codec_type: 'audio', codec_name: invalidProbe ? 'aac' : 'mp3' }],
            format: { duration: '30', format_name: 'mp3' },
          })
        : probeChild();
    download = downloadChild(args);
    return download;
  });
});
afterEach(async () => {
  await service.dispose();
  spawnMock.mockReset();
  vi.restoreAllMocks();
  if (
    path.dirname(root) !== path.resolve(tmpdir()) ||
    !path.basename(root).startsWith('tiksavemp4-mp3-test-')
  )
    throw new Error('Unsafe cleanup');
  await rm(root, { recursive: true, force: true });
});
async function start() {
  const response = await request(app)
    .post('/api/v1/analyze')
    .send({ url: publicUrl })
    .expect(200);
  const media = analysisSchema.parse(response.body as unknown);
  expect(media.capabilities).toEqual({ mp4: true, mp3: true });
  expect(response.text).not.toMatch(/selectors|cookie|signed-url|download-0/);
  const created = await request(app)
    .post('/api/v1/downloads')
    .send({ analysisId: media.id, downloadType: 'mp3' })
    .expect(201);
  const job = apiJobSchema.parse(created.body as unknown);
  await vi.waitFor(() => expect(download).toBeDefined());
  if (!download) throw new Error('Missing source');
  await download.complete();
  return { job, media, directory: download.directory };
}
it('converts with fixed safe encoder settings, serves audio/mpeg and cleans after single-use delivery', async () => {
  const { job, directory } = await start();
  await vi.waitFor(() => expect(service.getJob(job.id).status).toBe('ready'));
  expect(spawnMock).toHaveBeenCalledWith(
    'ffmpeg',
    expect.arrayContaining([
      '-nostdin',
      '-map',
      '0:a:0',
      '-vn',
      '-map_metadata',
      '-1',
      '-c:a',
      'libmp3lame',
      '-q:a',
      '2',
    ]),
    expect.objectContaining({ shell: false }),
  );
  expect(service.getJob(job.id).deliveredFormat).toEqual({
    id: 'audio-mp3',
    container: 'mp3',
    hasAudio: true,
    qualityLabel: 'MP3 Audio',
  });
  const file = service.getJob(job.id).fileUrl ?? '';
  await request(app)
    .get(file.replace(/token=.*/, `token=${'x'.repeat(43)}`))
    .expect(403);
  const response = await request(app)
    .get(file)
    .expect(200)
    .expect('Content-Type', 'audio/mpeg');
  expect(response.headers['content-disposition']).toBe(
    'attachment; filename="Test-creator-Test-source.mp3"',
  );
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  await vi.waitFor(() => expect(service.getJob(job.id).status).toBe('delivered'));
  await service.sweep();
  await expect(access(directory)).rejects.toThrow();
  await request(app).get(file).expect(409);
});
it.each(['wav', 'zip', '', 'MP3'])(
  'rejects unsupported download type %s',
  async (downloadType) => {
    await request(app)
      .post('/api/v1/downloads')
      .send({ analysisId: sourceFixture().media.id, downloadType })
      .expect(400);
    expect(spawnMock).not.toHaveBeenCalled();
  },
);
it('rejects client paths, selectors, filenames and URL overrides for MP3', async () => {
  for (const extra of [
    { formatId: 'best' },
    { filename: 'evil.mp3' },
    { path: 'C:/private' },
    { url: 'https://localhost/' },
  ])
    await request(app)
      .post('/api/v1/downloads')
      .send({ analysisId: sourceFixture().media.id, downloadType: 'mp3', ...extra })
      .expect(400);
  await request(app)
    .post('/api/v1/analyze')
    .send({ url: 'https://www.tiktok.com.evil.test/a' })
    .expect(400);
  expect(spawnMock).not.toHaveBeenCalled();
});
it('gates audio availability on source and server capability', async () => {
  await service.dispose();
  service = new ProductionDownloaderService(
    metadata,
    parseEnvironment({ DOWNLOAD_TEMP_ROOT: root }),
  );
  app = createApp(service);
  const response = await request(app)
    .post('/api/v1/analyze')
    .send({ url: publicUrl })
    .expect(200);
  const media = analysisSchema.parse(response.body as unknown);
  expect(media.capabilities?.mp3).toBe(false);
  await request(app)
    .post('/api/v1/downloads')
    .send({ analysisId: media.id, downloadType: 'mp3' })
    .expect(422);
  expect(spawnMock).not.toHaveBeenCalled();
});
it('refuses MP3 when the analyzed source has no usable audio', async () => {
  metadata.analyzeSource.mockImplementation(() => {
    const source = sourceFixture();
    source.media.formats = source.media.formats.map((format) => ({
      ...format,
      hasAudio: false,
    }));
    return Promise.resolve(source);
  });
  const response = await request(app)
    .post('/api/v1/analyze')
    .send({ url: publicUrl })
    .expect(200);
  const media = analysisSchema.parse(response.body as unknown);
  expect(media.capabilities?.mp3).toBe(false);
  await request(app)
    .post('/api/v1/downloads')
    .send({ analysisId: media.id, downloadType: 'mp3' })
    .expect(422);
  expect(spawnMock).not.toHaveBeenCalled();
});
it.each(['failure', 'probe'] as const)(
  'cleans failed conversion or invalid MP3: %s',
  async (mode) => {
    conversionMode = mode === 'failure' ? 'failure' : 'success';
    invalidProbe = mode === 'probe';
    const { job } = await start();
    await vi.waitFor(() => expect(service.getJob(job.id).status).toBe('error'));
    expect(service.getJob(job.id).error?.code).toBe(
      mode === 'failure' ? 'AUDIO_CONVERSION_FAILED' : 'AUDIO_VERIFICATION_FAILED',
    );
    expect(JSON.stringify(service.getJob(job.id))).not.toMatch(
      /secret|signed-url|cookie|private/,
    );
    await service.sweep();
    expect(await readdir(root)).toEqual([]);
  },
);
it.each(['cancel', 'timeout', 'shutdown'] as const)(
  'terminates conversion and cleans after %s',
  async (mode) => {
    conversionMode = 'pending';
    const { job, directory } = await start();
    await vi.waitFor(() => expect(conversion).toBeDefined());
    expect(service.getJob(job.id).progress).toEqual({ phase: 'converting' });
    if (mode === 'cancel') {
      await request(app)
        .delete(`/api/v1/downloads/${job.id}`)
        .set('Authorization', `Bearer ${job.accessToken ?? ''}`)
        .expect(200);
    } else if (mode === 'shutdown') await service.dispose();
    else
      await vi.waitFor(
        () => expect(service.getJob(job.id).error?.code).toBe('DOWNLOAD_TIMEOUT'),
        { timeout: 2500 },
      );
    if (mode !== 'shutdown') await service.sweep();
    expect(conversion?.kill).toHaveBeenCalledWith('SIGKILL');
    await expect(access(directory)).rejects.toThrow();
  },
);
