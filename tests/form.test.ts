// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';

import ejs from 'ejs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initializeDownloader } from '../src/frontend/downloader.js';
import type { Download, DownloaderAdapter, Media } from '../src/frontend/contracts.js';
import { mockData } from '../src/data/mock-data.js';

const media: Media = {
  id: 'test',
  title: '<script>not executable</script>',
  formats: [
    { id: 'one', label: 'Source video' },
    {
      id: 'two',
      label: 'Other available video',
      width: 640,
      height: 360,
      sizeBytes: 1024,
    },
  ],
};
const makeAdapter = (): DownloaderAdapter => ({
  analyze: vi.fn(() => Promise.resolve(media)),
  startDownload: vi.fn(() => Promise.resolve({ id: 'job' })),
  waitForDownload: vi.fn(() => Promise.resolve({ url: '/api/v1/downloads/ticket/file' })),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing test element ${selector}`);
  return found;
}
const input = () => element<HTMLInputElement>('#video-url');
const setInput = (value: string) => {
  input().value = value;
  input().dispatchEvent(new Event('input', { bubbles: true }));
};
const submit = () =>
  element<HTMLFormElement>('#download-form').dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true }),
  );
let ui: ReturnType<typeof initializeDownloader>;

beforeEach(async () => {
  const template = await readFile('views/partials/hero.ejs', 'utf8');
  document.body.innerHTML = ejs.render(template, mockData, {
    filename: 'views/partials/hero.ejs',
  });
});
afterEach(() => {
  ui?.destroy();
  document.body.replaceChildren();
});

describe('downloader form', () => {
  it('switches audio mode without reanalysis or stale video resolutions and restores MP4 quality', async () => {
    const adapter = makeAdapter();
    adapter.analyze = vi.fn(() =>
      Promise.resolve({ ...media, capabilities: { mp4: true, mp3: true } }),
    );
    ui = initializeDownloader(document, { adapter });
    setInput('https://vt.tiktok.com/abc/');
    submit();
    await vi.waitFor(() => expect(ui?.controller.getState().status).toBe('ready'));
    ui?.controller.selectFormat('two');
    const mp3 = element<HTMLInputElement>('input[name="download-type"][value="mp3"]');
    mp3.checked = true;
    mp3.dispatchEvent(new Event('change', { bubbles: true }));
    expect(element('#video-quality-panel').hidden).toBe(true);
    expect(element('#audio-quality-panel').hidden).toBe(false);
    expect(element('.download-label').textContent).toBe('Download MP3');
    expect(element('.rp-helper').textContent).toContain(
      'Audio quality depends on the source',
    );
    ui?.controller.selectDownloadType('mp4');
    expect(element('#video-quality-panel').hidden).toBe(false);
    expect(element<HTMLInputElement>('#format-1').checked).toBe(true);
    expect(adapter.analyze).toHaveBeenCalledOnce();
  });
  it('connects safe preview metadata, falls back on image failure and removes stale results immediately', async () => {
    const source = {
      ...media,
      title: 'A real source title',
      creator: 'Source creator',
      durationSeconds: 65,
      thumbnail:
        '/api/v1/analysis/123e4567-e89b-42d3-a456-426614174000/thumbnail?token=' +
        'a'.repeat(43),
    };
    const adapter = makeAdapter();
    adapter.analyze = vi.fn(() => Promise.resolve(source));
    ui = initializeDownloader(document, { adapter });
    setInput('https://www.tiktok.com/@creator/video/123');
    submit();
    await vi.waitFor(() => expect(ui?.controller.getState().status).toBe('ready'));
    const image = element<HTMLImageElement>('#result-thumbnail');
    expect(image.getAttribute('src')).toBe(source.thumbnail);
    expect(image.alt).toContain('Source creator');
    expect(element('#result-duration').textContent).toBe('1:05');
    expect(element('#result-creator').textContent).toBe('Source creator');
    image.dispatchEvent(new Event('error'));
    expect(image.getAttribute('src')).toBe('/assets/images/preview-unavailable.webp');
    expect(element('#preview-unavailable').hidden).toBe(false);
    setInput('https://www.tiktok.com/@other/video/456');
    expect(element('#result-card').hidden).toBe(true);
    expect(element('#result-creator').textContent).toBe('');
    expect(document.querySelectorAll('input[name="format"]')).toHaveLength(0);
  });
  it('keeps four primary rows and offers accessible additional options', async () => {
    const adapter = makeAdapter();
    adapter.analyze = vi.fn(() =>
      Promise.resolve({
        ...media,
        formats: Array.from({ length: 6 }, (_, index) => ({
          id: `option-${String(index)}`,
          label: `${String(1080 - index * 100)}p`,
        })),
      }),
    );
    ui = initializeDownloader(document, { adapter });
    setInput('https://www.tiktok.com/@creator/video/123');
    submit();
    await vi.waitFor(() => expect(ui?.controller.getState().status).toBe('ready'));
    expect(document.querySelectorAll('#format-options input')).toHaveLength(4);
    expect(element('#more-formats').hidden).toBe(false);
    expect(document.querySelectorAll('#extra-format-options input')).toHaveLength(2);
    const radio = element<HTMLInputElement>('#format-5');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(ui?.controller.getState().formatId).toBe('option-5');
  });
  it('ignores stale clipboard text after Clear', async () => {
    const copied = deferred<string>();
    ui = initializeDownloader(document, {
      adapter: makeAdapter(),
      clipboard: { readText: () => copied.promise },
    });
    setInput('original');
    element<HTMLButtonElement>('.paste-button').click();
    element<HTMLButtonElement>('.clear-button').click();
    copied.resolve('https://vt.tiktok.com/late/');
    await copied.promise;
    expect(input().value).toBe('');
  });

  it('blocks invalid links before the adapter and focuses the unchanged input', () => {
    const adapter = makeAdapter();
    ui = initializeDownloader(document, { adapter });
    setInput('https://example.com/video/123');
    submit();
    expect(adapter.analyze).not.toHaveBeenCalled();
    expect(input().value).toBe('https://example.com/video/123');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(input());
    expect(element('#form-status').textContent).toContain('public TikTok');
  });

  it('preserves links and announces adapter errors without duplicate submissions', async () => {
    const adapter = makeAdapter();
    const response = deferred<Media>();
    adapter.analyze = vi.fn(() => response.promise);
    ui = initializeDownloader(document, { adapter });
    setInput('https://www.tiktok.com/@creator/video/123');
    submit();
    submit();
    expect(adapter.analyze).toHaveBeenCalledTimes(1);
    expect(element('#analyzing-indicator').hidden).toBe(false);
    expect(input().disabled).toBe(true);
    element<HTMLButtonElement>('.clear-button').click();
    expect(input().value).toBe('');
    expect(input().disabled).toBe(false);
    response.resolve(media);
    await vi.waitFor(() => expect(ui?.controller.getState().status).toBe('idle'));
    expect(element('#result-card').hidden).toBe(true);
  });

  it('uses the clipboard and clears without inserting a sample URL', async () => {
    const clipboard = {
      readText: vi.fn(() => Promise.resolve('https://vt.tiktok.com/test/')),
    };
    ui = initializeDownloader(document, { adapter: makeAdapter(), clipboard });
    element<HTMLButtonElement>('.paste-button').click();
    await vi.waitFor(() => expect(input().value).toBe('https://vt.tiktok.com/test/'));
    expect(document.activeElement).toBe(input());
    element<HTMLButtonElement>('.clear-button').click();
    expect(input().value).toBe('');
    expect(document.activeElement).toBe(input());
  });

  it('keeps user text when clipboard access fails', async () => {
    ui = initializeDownloader(document, {
      adapter: makeAdapter(),
      clipboard: { readText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    setInput('my entered link');
    element<HTMLButtonElement>('.paste-button').click();
    await vi.waitFor(() =>
      expect(element('#form-status').textContent).toContain(
        'Clipboard access is unavailable',
      ),
    );
    expect(input().value).toBe('my entered link');
  });

  it('renders only API formats safely and only API-supplied metadata', async () => {
    ui = initializeDownloader(document, { adapter: makeAdapter() });
    setInput('https://www.tiktok.com/@creator/video/123');
    submit();
    await vi.waitFor(() => expect(element('#result-card').hidden).toBe(false));
    expect(document.querySelectorAll('input[name="format"]')).toHaveLength(2);
    expect(element('#result-title').textContent).toBe(media.title);
    expect(document.querySelector('#result-card script')).toBeNull();
    expect(element('#format-options').textContent).toContain('640 × 360');
    expect(element('#format-options').textContent).toContain('~1 KB');
    expect(element('#format-options').textContent).not.toContain('1080');
    expect(document.activeElement).toBe(element('#result-title'));
    const radio = element<HTMLInputElement>('#format-1');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(ui?.controller.getState().formatId).toBe('two');
  });

  it('shows indeterminate progress, real zero values, and requested rather than saved', async () => {
    const adapter = makeAdapter();
    const file = deferred<Download>();
    let report: (progress: unknown) => void = () => undefined;
    adapter.waitForDownload = vi.fn((_job, _signal, onProgress) => {
      report = onProgress;
      return file.promise;
    });
    const handoff = vi.fn();
    ui = initializeDownloader(document, { adapter, requestDownload: handoff });
    setInput('https://www.tiktok.com/@creator/video/123');
    submit();
    await vi.waitFor(() => expect(ui?.controller.getState().status).toBe('ready'));
    element<HTMLButtonElement>('.download-button').click();
    await vi.waitFor(() => expect(ui?.controller.getState().status).toBe('downloading'));
    const progress = element<HTMLProgressElement>('#download-progress');
    expect(progress.hasAttribute('value')).toBe(false);
    expect(element('#progress-metrics').textContent).toContain('Preparing');
    report({ percent: 0, speedBytesPerSecond: 0, sizeBytes: 0 });
    expect(progress.value).toBe(0);
    expect(element('#progress-metrics').textContent).toContain('B/s');
    report({ percent: 70 });
    expect(progress.value).toBe(70);
    expect(element('#progress-metrics').textContent).toContain('70%');
    expect(element('#progress-metrics').textContent).not.toContain('B/s');
    file.resolve({ url: '/api/v1/downloads/ticket/file' });
    await vi.waitFor(() => expect(ui?.controller.getState().status).toBe('completed'));
    expect(handoff).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(element('#completed-title'));
    element<HTMLButtonElement>('.save-button').click();
    await vi.waitFor(() =>
      expect(ui?.controller.getState().status).toBe('download-requested'),
    );
    expect(handoff).toHaveBeenCalledOnce();
    expect(element('#form-status').textContent).toContain('saving is not confirmed');
    expect(document.activeElement).toBe(element('#form-status'));
  });

  it('preserves the entered URL after a backend error and focuses the message', async () => {
    const adapter = makeAdapter();
    adapter.analyze = vi.fn().mockRejectedValue(new Error('Video unavailable'));
    ui = initializeDownloader(document, { adapter });
    setInput('https://www.tiktok.com/@creator/video/123');
    submit();
    await vi.waitFor(() => expect(ui?.controller.getState().status).toBe('error'));
    expect(input().value).toBe('https://www.tiktok.com/@creator/video/123');
    expect(document.activeElement).toBe(element('#form-status'));
  });
});
