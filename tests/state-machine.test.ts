import { describe, expect, it, vi } from 'vitest';

import {
  createDownloaderController,
  initialState,
  transition,
  type Status,
} from '../src/frontend/state-machine.js';
import type {
  Download,
  DownloadJob,
  DownloaderAdapter,
  Media,
} from '../src/frontend/contracts.js';

// Explicit test fixtures; these never ship to the preview adapter.
const media: Media = {
  id: 'fixture',
  title: 'Test response',
  formats: [
    { id: 'source', label: 'Source video' },
    { id: 'alternate', label: 'Alternate video', sizeBytes: 2048 },
  ],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function makeAdapter(): DownloaderAdapter {
  return {
    analyze: vi.fn(() => Promise.resolve(media)),
    startDownload: vi.fn(() => Promise.resolve({ id: 'job' })),
    waitForDownload: vi.fn(() =>
      Promise.resolve({ url: '/api/v1/downloads/ticket/file' }),
    ),
  };
}

describe('downloader state machine', () => {
  it('defaults to MP4, preserves quality across MP3 switching, sends an audio intent and resets on new URLs', async () => {
    const adapter = makeAdapter();
    adapter.analyze = vi.fn(() =>
      Promise.resolve({ ...media, capabilities: { mp4: true, mp3: true } }),
    );
    const controller = createDownloaderController({ adapter, requestDownload: vi.fn() });
    controller.setUrl('https://www.tiktok.com/@creator/video/123');
    await controller.analyze();
    expect(controller.getState().downloadType).toBe('mp4');
    controller.selectFormat('alternate');
    controller.selectDownloadType('mp3');
    expect(controller.getState().formatId).toBe('alternate');
    controller.selectDownloadType('mp4');
    expect(controller.getState().formatId).toBe('alternate');
    controller.selectDownloadType('mp3');
    await controller.download();
    expect(adapter.startDownload).toHaveBeenCalledWith(
      media.id,
      'alternate',
      expect.any(AbortSignal),
      'mp3',
    );
    expect(controller.getState().message).toContain('Your MP3 is ready');
    expect(adapter.analyze).toHaveBeenCalledOnce();
    controller.setUrl('https://vt.tiktok.com/another/');
    expect(controller.getState()).toMatchObject({ downloadType: 'mp4', media: null });
  });
  it('refuses MP3 selection when the backend has not enabled it', async () => {
    const adapter = makeAdapter();
    const controller = createDownloaderController({ adapter, requestDownload: vi.fn() });
    controller.setUrl('https://vt.tiktok.com/abc/');
    await controller.analyze();
    controller.selectDownloadType('mp3');
    expect(controller.getState().downloadType).toBe('mp4');
  });
  it('keeps valid analyzed metadata on failure and allows another quality without analysis', async () => {
    const adapter = makeAdapter();
    adapter.startDownload = vi.fn().mockRejectedValue(new Error('Source unavailable'));
    const controller = createDownloaderController({ adapter, requestDownload: vi.fn() });
    controller.setUrl('https://www.tiktok.com/@creator/video/123');
    await controller.analyze();
    await controller.download();
    expect(controller.getState()).toMatchObject({
      status: 'error',
      media,
      formatId: 'source',
    });
    controller.chooseQuality();
    controller.selectFormat('alternate');
    expect(controller.getState()).toMatchObject({
      status: 'ready',
      formatId: 'alternate',
    });
    expect(adapter.analyze).toHaveBeenCalledTimes(1);
  });
  it('cancels an abandoned prepared file and refuses an expired file capability', async () => {
    const adapter = makeAdapter();
    adapter.cancelDownload = vi.fn(() => Promise.resolve());
    adapter.waitForDownload = vi.fn(() =>
      Promise.resolve({
        url: '/api/v1/downloads/ticket/file',
        expiresAt: Date.now() - 1,
      }),
    );
    const handoff = vi.fn();
    const controller = createDownloaderController({ adapter, requestDownload: handoff });
    controller.setUrl('https://www.tiktok.com/@creator/video/123');
    await controller.analyze();
    await controller.download();
    controller.save();
    expect(controller.getState()).toMatchObject({
      status: 'error',
      media,
      message: expect.stringContaining('expired'),
    });
    expect(adapter.cancelDownload).toHaveBeenCalledWith({ id: 'job' });
    expect(handoff).not.toHaveBeenCalled();
  });
  it('does not start file delivery when the API reports it is unavailable', async () => {
    const adapter = makeAdapter();
    adapter.analyze = vi.fn(() =>
      Promise.resolve({ ...media, downloadAvailable: false }),
    );
    const controller = createDownloaderController({ adapter, requestDownload: vi.fn() });
    controller.setUrl('https://www.tiktok.com/@creator/video/123');
    await controller.analyze();
    await controller.download();
    expect(controller.getState().status).toBe('ready');
    expect(adapter.startDownload).not.toHaveBeenCalled();
  });
  it('rejects invalid transitions and unknown format selection', () => {
    const idle = initialState();
    expect(transition(idle, { type: 'DOWNLOADING' })).toBe(idle);
    expect(transition(idle, { type: 'START' })).toBe(idle);
    expect(transition(idle, { type: 'READY', media })).toBe(idle);
    const ready = { ...idle, status: 'ready' as const, media, formatId: 'source' };
    expect(transition(ready, { type: 'SELECT', formatId: 'fabricated' })).toBe(ready);
  });

  it('validates before calling the API and preserves the entered URL', async () => {
    const adapter = makeAdapter();
    const controller = createDownloaderController({ adapter, requestDownload: vi.fn() });
    controller.setUrl('https://www.tiktok.com.evil.test/@creator/video/123');
    await controller.analyze();
    expect(adapter.analyze).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({
      status: 'error',
      invalidUrl: true,
      url: 'https://www.tiktok.com.evil.test/@creator/video/123',
    });
  });

  it('walks the complete API-driven lifecycle without timers', async () => {
    const adapter = makeAdapter();
    const job = deferred<DownloadJob>();
    const file = deferred<Download>();
    adapter.startDownload = vi.fn(() => job.promise);
    adapter.waitForDownload = vi.fn<DownloaderAdapter['waitForDownload']>(
      (_job, _signal, report) => {
        report({});
        report({ percent: 25, speedBytesPerSecond: 512, sizeBytes: 2048 });
        return file.promise;
      },
    );
    const handoff = vi.fn();
    const controller = createDownloaderController({ adapter, requestDownload: handoff });
    const states: Status[] = [];
    controller.subscribe((state) => states.push(state.status));
    controller.setUrl('https://www.tiktok.com/@creator/video/123');
    await controller.analyze();
    controller.selectFormat('alternate');
    const request = controller.download();
    await controller.download();
    expect(adapter.startDownload).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe('starting-download');
    job.resolve({ id: 'job' });
    await vi.waitFor(() => expect(controller.getState().status).toBe('downloading'));
    expect(controller.getState().progress).toEqual({
      percent: 25,
      speedBytesPerSecond: 512,
      sizeBytes: 2048,
    });
    file.resolve({ url: '/api/v1/downloads/ticket/file' });
    await request;
    expect(controller.getState().status).toBe('completed');
    expect(handoff).not.toHaveBeenCalled();
    controller.save();
    controller.save();
    expect(controller.getState().status).toBe('download-requested');
    expect(handoff).toHaveBeenCalledWith('/api/v1/downloads/ticket/file');
    expect(states).toEqual(
      expect.arrayContaining([
        'idle',
        'validating',
        'analyzing',
        'ready',
        'starting-download',
        'downloading',
        'completed',
        'download-requested',
      ]),
    );
  });

  it('prevents duplicate analyses, aborts, and ignores a late response', async () => {
    const response = deferred<Media>();
    const adapter = makeAdapter();
    adapter.analyze = vi.fn(() => response.promise);
    const controller = createDownloaderController({ adapter, requestDownload: vi.fn() });
    controller.setUrl('https://vt.tiktok.com/abc/');
    const pending = controller.analyze();
    await controller.analyze();
    expect(adapter.analyze).toHaveBeenCalledTimes(1);
    const signal = vi.mocked(adapter.analyze).mock.calls[0]?.[1];
    controller.cancel();
    expect(signal?.aborted).toBe(true);
    expect(controller.getState().url).toBe('https://vt.tiktok.com/abc/');
    response.resolve(media);
    await pending;
    expect(controller.getState().status).toBe('idle');
  });

  it('cancels a download and prevents a stale browser handoff', async () => {
    const response = deferred<Download>();
    const adapter = makeAdapter();
    adapter.waitForDownload = vi.fn(() => response.promise);
    const handoff = vi.fn();
    const controller = createDownloaderController({ adapter, requestDownload: handoff });
    controller.setUrl('https://www.tiktok.com/@creator/video/123');
    await controller.analyze();
    const pending = controller.download();
    await vi.waitFor(() => expect(controller.getState().status).toBe('downloading'));
    controller.cancel();
    expect(controller.getState().status).toBe('ready');
    response.resolve({ url: '/api/v1/downloads/stale/file' });
    await pending;
    expect(handoff).not.toHaveBeenCalled();
  });

  it('does not hand off an unsafe URL or accept invalid progress', async () => {
    const adapter = makeAdapter();
    adapter.waitForDownload = vi.fn<DownloaderAdapter['waitForDownload']>(
      (_job, _signal, report) => {
        report({ percent: 150, speedBytesPerSecond: -1 });
        return Promise.resolve({ url: 'https://evil.test/file' });
      },
    );
    const handoff = vi.fn();
    const controller = createDownloaderController({ adapter, requestDownload: handoff });
    controller.setUrl('https://www.tiktok.com/@creator/video/123');
    await controller.analyze();
    await controller.download();
    expect(controller.getState()).toMatchObject({ status: 'error', progress: null });
    expect(handoff).not.toHaveBeenCalled();
  });

  it('handles adapter errors and supports a fresh retry', async () => {
    const adapter = makeAdapter();
    adapter.analyze = vi
      .fn()
      .mockRejectedValueOnce(new Error('Public video unavailable'))
      .mockResolvedValueOnce(media);
    const controller = createDownloaderController({ adapter, requestDownload: vi.fn() });
    controller.setUrl('https://www.tiktok.com/@creator/video/123');
    await controller.analyze();
    expect(controller.getState()).toMatchObject({
      status: 'error',
      url: 'https://www.tiktok.com/@creator/video/123',
      message: 'Public video unavailable',
    });
    await controller.analyze();
    expect(controller.getState().status).toBe('ready');
  });
});
