import { access, mkdtemp, mkdir, readdir, rm, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductionDownloaderService } from '../src/services/downloader.js';
import { parseEnvironment } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { parseDownloadProgress } from '../src/services/download-progress.js';
import {
  downloadChild,
  sourceFixture,
  publicUrl,
  probeChild,
} from './fixtures/download.js';

const spawnMock = vi.hoisted(() =>
  vi.fn<(executable: string, args: string[], options: unknown) => unknown>(),
);
vi.mock('node:child_process', () => ({ spawn: spawnMock }));
let root: string;
let service: ProductionDownloaderService;
const children: ReturnType<typeof downloadChild>[] = [];
const context = () => ({
  signal: new AbortController().signal,
  requestId: 'job-test-request',
  logger: createLogger({ level: 'silent' }),
});
const metadata = { analyzeSource: vi.fn(() => Promise.resolve(sourceFixture())) };
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'ttsave-jobs-test-'));
  service = new ProductionDownloaderService(
    metadata,
    parseEnvironment({
      DOWNLOAD_TEMP_ROOT: root,
      DOWNLOAD_MAX_CONCURRENT: '1',
      DOWNLOAD_MAX_BYTES: '1024',
    }),
  );
  metadata.analyzeSource.mockImplementation(() => Promise.resolve(sourceFixture()));
  children.length = 0;
  spawnMock.mockImplementation((_executable, args) => {
    if (_executable === 'ffprobe') return probeChild();
    const child = downloadChild(args);
    children.push(child);
    return child;
  });
});
afterEach(async () => {
  await service.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  spawnMock.mockReset();
  if (
    path.dirname(root) !== path.resolve(tmpdir()) ||
    !path.basename(root).startsWith('ttsave-jobs-test-')
  )
    throw new Error('Unsafe test cleanup directory');
  await rm(root, { recursive: true, force: true });
});
async function start() {
  const media = await service.analyze(publicUrl, context());
  const job = service.createJob(media.id, 'source-1', context());
  await vi.waitFor(() => expect(children).toHaveLength(1));
  const child = children[0];
  if (!child) throw new Error('Missing fake child');
  return { media, job, child };
}
async function ready() {
  const result = await start();
  await result.child.complete();
  await vi.waitFor(() => expect(service.getJob(result.job.id).status).toBe('ready'));
  return result;
}

describe('production download jobs', () => {
  it.each([
    {
      streams: [{ codec_type: 'video', width: 720, height: 1280 }],
      format: { duration: '30', format_name: 'mp4' },
    },
    {
      streams: [
        { codec_type: 'video', width: 360, height: 640 },
        { codec_type: 'audio' },
      ],
      format: { duration: '30', format_name: 'mp4' },
    },
    {
      streams: [
        { codec_type: 'video', width: 720, height: 1280 },
        { codec_type: 'audio' },
      ],
      format: { duration: '999999', format_name: 'mp4' },
    },
  ])('rejects an undeliverable file and cleans temporary data: %j', async (probe) => {
    spawnMock.mockImplementation((executable, args) => {
      if (executable === 'ffprobe') return probeChild(probe);
      const child = downloadChild(args);
      children.push(child);
      return child;
    });
    const { job, child } = await start();
    await child.complete();
    await vi.waitFor(() => expect(service.getJob(job.id).status).toBe('error'));
    expect(service.getJob(job.id).error?.code).toBe('VIDEO_VERIFICATION_FAILED');
    await vi.waitFor(async () => expect(await readdir(root)).toEqual([]));
  });
  it('uses unpredictable IDs, capability authorization and private server-controlled output', async () => {
    const { media, job, child } = await ready();
    expect(media.downloadAvailable).toBe(true);
    expect(job.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(job.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(child.directory).toMatch(/job-/);
    expect(path.dirname(child.directory)).toBe(root);
    expect(() => service.authorizeJob(job.id, undefined)).toThrow(
      'authorization is required',
    );
    expect(() => service.authorizeJob(job.id, 'x'.repeat(43))).toThrow('not authorized');
    service.authorizeJob(job.id, job.accessToken);
    const snapshot = service.getJob(job.id);
    expect(snapshot.accessToken).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain(root);
    expect(spawnMock).toHaveBeenCalledWith(
      'yt-dlp',
      expect.arrayContaining([
        '--paths',
        child.directory,
        '--output',
        'video.mp4',
        '--fixup',
        'never',
        '--impersonate',
        'chrome',
        '--progress-template',
      ]),
      expect.objectContaining({ shell: false }),
    );
    expect(spawnMock.mock.calls[0]?.[1].slice(-2)).toEqual(['--', publicUrl]);
    expect(spawnMock.mock.calls[0]?.[1]).not.toContain('--ffmpeg-location');
    const second = service.createJob(media.id, 'source-1', context());
    expect(second.id).not.toBe(job.id);
    expect(second.accessToken).not.toBe(job.accessToken);
    service.cancel(second.id);
  });
  it('publishes only structured progress and keeps unknown totals indeterminate', async () => {
    const { job, child } = await start();
    const update = vi.fn();
    const unsubscribe = service.subscribe(job.id, update);
    child.stdout.write('[download] 99% at 100MB/s\n');
    expect(update).not.toHaveBeenCalled();
    child.stdout.write(
      'TTSave:{"downloadedBytes":10,"totalBytes":null,"speedBytesPerSecond":null}\n',
    );
    expect(service.getJob(job.id).progress).toEqual({ downloadedBytes: 10 });
    child.stdout.write(
      'TTSave:{"downloadedBytes":16,"totalBytes":32,"speedBytesPerSecond":128}\n',
    );
    expect(service.getJob(job.id).progress).toEqual({
      percent: 50,
      downloadedBytes: 16,
      sizeBytes: 32,
      speedBytesPerSecond: 128,
    });
    unsubscribe();
    await service.sweep();
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(service.getJob(job.id).status).toBe('cancelled');
    await expect(access(child.directory)).rejects.toThrow();
  });
  it('enforces concurrency and checks requested formats against saved analysis', async () => {
    const { media, job } = await start();
    expect(() => service.createJob(media.id, 'invented', context())).toThrow(
      'Choose a format',
    );
    expect(() => service.createJob(media.id, 'source-1', context())).toThrow(
      'capacity is full',
    );
    service.cancel(job.id);
    await service.sweep();
    const next = service.createJob(media.id, 'source-1', context());
    service.cancel(next.id);
  });
  it('enforces a shared analysis/download operation budget', async () => {
    await service.dispose();
    service = new ProductionDownloaderService(
      metadata,
      parseEnvironment({ DOWNLOAD_TEMP_ROOT: root, APPLICATION_MAX_CONCURRENT: '1' }),
    );
    const media = await service.analyze(publicUrl, context());
    let release!: (value: ReturnType<typeof sourceFixture>) => void;
    metadata.analyzeSource.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const analysis = service.analyze(publicUrl, context());
    expect(() => service.createJob(media.id, 'source-1', context())).toThrow(
      'TTSave is busy',
    );
    release(sourceFixture());
    await analysis;
  });
  it.each([null, 0, 601])(
    'rejects unverifiable or excessive duration: %s',
    async (duration) => {
      const source = sourceFixture();
      source.media.durationSeconds = duration;
      metadata.analyzeSource.mockResolvedValueOnce(source);
      await expect(service.analyze(publicUrl, context())).rejects.toMatchObject({
        code: duration === 601 ? 'VIDEO_TOO_LONG' : 'DURATION_UNKNOWN',
      });
      expect(spawnMock).not.toHaveBeenCalled();
    },
  );
  it('deletes partial data on cancellation and accepts cancellation only once', async () => {
    const { job, child } = await start();
    await writeFile(path.join(child.directory, 'video.mp4.part'), 'partial');
    service.cancel(job.id);
    service.cancel(job.id);
    await service.sweep();
    expect(child.kill).toHaveBeenCalledTimes(1);
    await expect(access(child.directory)).rejects.toThrow();
    expect(service.getJob(job.id).status).toBe('cancelled');
  });
  it('deletes data on extractor failure without exposing stderr or paths', async () => {
    const { job, child } = await start();
    await writeFile(path.join(child.directory, 'video.mp4.part'), 'partial');
    child.stderr.write('secret traceback at C:/private/path');
    child.emit('close', 1);
    await vi.waitFor(() => expect(service.getJob(job.id).status).toBe('error'));
    await service.sweep();
    expect(service.getJob(job.id).error).toMatchObject({
      code: 'DOWNLOAD_FAILED',
      requestId: 'job-test-request',
    });
    expect(JSON.stringify(service.getJob(job.id))).not.toMatch(
      /secret|private|traceback/,
    );
    await expect(access(child.directory)).rejects.toThrow();
  });
  it('terminates and cleans up when structured progress exceeds the size limit', async () => {
    const { job, child } = await start();
    child.stdout.write('TTSave:{"downloadedBytes":2048,"totalBytes":null}\n');
    await vi.waitFor(() => expect(service.getJob(job.id).status).toBe('error'));
    await service.sweep();
    expect(service.getJob(job.id).error?.code).toBe('VIDEO_TOO_LARGE');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    await expect(access(child.directory)).rejects.toThrow();
  });
  it('enforces actual disk usage when progress provides no totals', async () => {
    const { job, child } = await start();
    await writeFile(path.join(child.directory, 'video.mp4.part'), Buffer.alloc(2048));
    await vi.waitFor(() => expect(service.getJob(job.id).status).toBe('error'));
    await service.sweep();
    expect(service.getJob(job.id).error?.code).toBe('VIDEO_TOO_LARGE');
    await expect(access(child.directory)).rejects.toThrow();
  });
  it('rejects an invalid completed file and deletes it', async () => {
    const { job, child } = await start();
    await child.complete(Buffer.from('not a video file'));
    await vi.waitFor(() => expect(service.getJob(job.id).status).toBe('error'));
    await service.sweep();
    expect(service.getJob(job.id).error?.code).toBe('INVALID_DOWNLOAD_FILE');
    await expect(access(child.directory)).rejects.toThrow();
  });
  it('enforces the job deadline, terminates and cleans up', async () => {
    await service.dispose();
    service = new ProductionDownloaderService(
      metadata,
      parseEnvironment({ DOWNLOAD_TEMP_ROOT: root, DOWNLOAD_TIMEOUT_MS: '1000' }),
    );
    const { job, child } = await start();
    await vi.waitFor(() => expect(service.getJob(job.id).status).toBe('error'), {
      timeout: 2000,
    });
    await service.sweep();
    expect(service.getJob(job.id).error?.code).toBe('DOWNLOAD_TIMEOUT');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    await expect(access(child.directory)).rejects.toThrow();
  });
  it('uses expiring single-use file tokens and removes data after delivery', async () => {
    const { job, child } = await ready();
    const url = service.getJob(job.id).fileUrl;
    expect(url).toMatch(/\/file\?token=[A-Za-z0-9_-]{43}$/);
    const fileToken =
      new URL(url ?? '', 'https://ttsave.invalid').searchParams.get('token') ?? '';
    await expect(service.claimFile(job.id, 'x'.repeat(43))).rejects.toMatchObject({
      code: 'FILE_ACCESS_DENIED',
    });
    const claim = await service.claimFile(job.id, fileToken);
    await expect(service.claimFile(job.id, fileToken)).rejects.toMatchObject({
      code: 'FILE_UNAVAILABLE',
    });
    await claim.release(true);
    expect(service.getJob(job.id).status).toBe('delivered');
    await expect(access(child.directory)).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  });
  it('deletes data after a failed/disconnected delivery', async () => {
    const { job, child } = await ready();
    const fileToken =
      new URL(
        service.getJob(job.id).fileUrl ?? '',
        'https://ttsave.invalid',
      ).searchParams.get('token') ?? '';
    const claim = await service.claimFile(job.id, fileToken);
    await claim.release(false);
    expect(service.getJob(job.id).status).toBe('cancelled');
    await expect(access(child.directory)).rejects.toThrow();
  });
  it('sweeps expired files and analysis/job entries', async () => {
    const { media, job, child } = await ready();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 700_000);
    await service.sweep();
    clock.mockRestore();
    expect(() => service.getJob(job.id)).toThrow('not found or has expired');
    expect(() => service.createJob(media.id, 'source-1', context())).toThrow(
      'analysis was not found',
    );
    await expect(access(child.directory)).rejects.toThrow();
  });
  it('removes old owned orphan directories after restart and preserves other names', async () => {
    const orphan = await mkdtemp(path.join(root, 'job-'));
    await writeFile(path.join(orphan, 'video.mp4.part'), 'partial');
    const old = new Date(Date.now() - 700_000);
    await utimes(orphan, old, old);
    const other = path.join(root, 'unrelated');
    await mkdir(other);
    await service.sweep();
    await expect(access(orphan)).rejects.toThrow();
    await expect(access(other)).resolves.toBeUndefined();
  });
});
describe('structured extractor progress', () => {
  it('does not parse normal console text, estimates, invalid JSON or invalid numbers', () => {
    expect(parseDownloadProgress('50% at 1 MB/s', 1024)).toBeNull();
    expect(parseDownloadProgress('TTSave:garbage', 1024)).toBeNull();
    expect(parseDownloadProgress('TTSave:{"downloadedBytes":-1}', 1024)).toBeNull();
    expect(
      parseDownloadProgress(
        'TTSave:{"downloadedBytes":16,"totalBytes":"NA","total_bytes_estimate":32}',
        1024,
      ),
    ).toEqual({ downloadedBytes: 16 });
    expect(
      parseDownloadProgress(
        'TTSave:{"downloadedBytes":0,"totalBytes":32,"speedBytesPerSecond":0}',
        1024,
      ),
    ).toEqual({ percent: 0, downloadedBytes: 0, sizeBytes: 32, speedBytesPerSecond: 0 });
  });
});
