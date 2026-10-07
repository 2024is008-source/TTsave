import { expect, it, vi } from 'vitest';
import { MockDownloaderService } from '../src/services/mock-downloader.js';

it('notifies live subscribers on cancellation and releases disconnected listeners', () => {
  const service = new MockDownloaderService();
  const media = service.analyze('https://vt.tiktok.com/abc/');
  const job = service.createJob(media.id, 'mock-mp4');
  const listener = vi.fn();
  const unsubscribe = service.subscribe(job.id, listener);
  service.cancel(job.id);
  expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
  unsubscribe();
  service.cancel(job.id);
  expect(listener).toHaveBeenCalledTimes(1);
});
it('bounds its memory and expires old analyses and jobs without completion timers', () => {
  const time = vi.spyOn(Date, 'now');
  time.mockReturnValue(0);
  try {
    const service = new MockDownloaderService();
    const media = service.analyze('https://vt.tiktok.com/abc/');
    const job = service.createJob(media.id, 'mock-mp4');
    for (let i = 1; i < 200; i++) service.analyze('https://vt.tiktok.com/abc/');
    expect(() => service.analyze('https://vt.tiktok.com/abc/')).toThrow(
      'preview is busy',
    );
    time.mockReturnValue(30 * 60_000 + 1);
    expect(() => service.getJob(job.id)).toThrow('not found or has expired');
    expect(() => service.createJob(media.id, 'mock-mp4')).toThrow(
      'not found or has expired',
    );
    expect(service.analyze('https://vt.tiktok.com/abc/').mock).toBe(true);
  } finally {
    time.mockRestore();
  }
});
