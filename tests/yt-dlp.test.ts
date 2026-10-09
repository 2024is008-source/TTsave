import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnvironment } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { runTool, stopRunningTools } from '../src/services/tool-process.js';
import { checkTools } from '../src/services/tool-check.js';
import { normalizeMetadata, YtDlpAnalyzer } from '../src/services/yt-dlp.js';

const spawnMock = vi.hoisted(() =>
  vi.fn<(executable: string, args: string[], options: unknown) => unknown>(),
);
vi.mock('node:child_process', () => ({ spawn: spawnMock }));
const photoMock = vi.hoisted(() =>
  vi.fn().mockRejectedValue(new Error('Unsupported public photo metadata')),
);
vi.mock('../src/services/photo-metadata.js', () => ({ analyzePhoto: photoMock }));

const url = 'https://www.tiktok.com/@creator/video/123';
const config = parseEnvironment({});
const fixture = {
  extractor_key: 'TikTok',
  title: 'Source title',
  uploader: 'Source creator',
  duration: 8.5,
  availability: 'public',
  thumbnail: 'https://remote.test/private-thumbnail',
  http_headers: { Cookie: 'secret' },
  formats: [
    {
      format_id: 'internal-selector',
      ext: 'mp4',
      protocol: 'https',
      url: 'https://video.tiktokcdn.com/source.mp4',
      vcodec: 'h264',
      acodec: 'aac',
      width: 720,
      height: 1280,
      filesize: 2048,
    },
  ],
};
function childProcess() {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
}
function launch(stdout: string, code = 0, stderr = '') {
  const child = childProcess();
  spawnMock.mockImplementationOnce(() => {
    queueMicrotask(() => {
      child.stdout.write(stdout);
      child.stderr.write(stderr);
      child.emit('close', code);
    });
    return child;
  });
  return child;
}
function context(controller = new AbortController()) {
  return {
    signal: controller.signal,
    requestId: 'test-request-id',
    logger: createLogger({ level: 'silent' }),
  };
}
afterEach(() => {
  photoMock.mockReset().mockRejectedValue(new Error('Unsupported public photo metadata'));
  spawnMock.mockReset();
  vi.useRealTimers();
});

describe('bounded external process', () => {
  it('spawns an executable and argument array without a shell and captures output', async () => {
    launch('structured-output');
    const result = await runTool(
      config.YTDLP_PATH,
      ['--version'],
      { timeoutMs: 1000, maxOutputBytes: 100 },
      context(),
    );
    expect(result.stdout).toBe('structured-output');
    expect(spawnMock).toHaveBeenCalledWith(
      'yt-dlp',
      ['--version'],
      expect.objectContaining({
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  });
  it('kills a timed-out process and logs the request ID', async () => {
    vi.useFakeTimers();
    const child = childProcess();
    spawnMock.mockReturnValue(child);
    const ctx = context();
    const log = vi.spyOn(ctx.logger, 'warn');
    const pending = runTool('yt-dlp', [], { timeoutMs: 1000, maxOutputBytes: 100 }, ctx);
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'ANALYSIS_TIMEOUT',
      status: 504,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'test-request-id', code: 'ANALYSIS_TIMEOUT' }),
      expect.any(String),
    );
    child.emit('error', new Error('late process error'));
  });
  it.each(['stdout', 'stderr'] as const)(
    'limits captured %s bytes and kills the process',
    async (stream) => {
      const child = childProcess();
      spawnMock.mockReturnValue(child);
      const pending = runTool(
        'yt-dlp',
        [],
        { timeoutMs: 1000, maxOutputBytes: 4 },
        context(),
      );
      const assertion = expect(pending).rejects.toMatchObject({
        code: 'ANALYSIS_OUTPUT_LIMIT',
      });
      child[stream].write('雪雪'); // Six bytes, not two characters.
      await assertion;
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    },
  );
  it('aborts active processes and does not spawn already-cancelled requests', async () => {
    const controller = new AbortController();
    const child = childProcess();
    spawnMock.mockReturnValue(child);
    const pending = runTool(
      'yt-dlp',
      [],
      { timeoutMs: 1000, maxOutputBytes: 100 },
      context(controller),
    );
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'REQUEST_CANCELLED',
    });
    controller.abort();
    await assertion;
    expect(child.kill).toHaveBeenCalledTimes(1);
    await expect(
      runTool(
        'yt-dlp',
        [],
        { timeoutMs: 1000, maxOutputBytes: 100 },
        context(controller),
      ),
    ).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
  it('hides spawn errors', async () => {
    const child = childProcess();
    spawnMock.mockReturnValue(child);
    const pending = runTool(
      'yt-dlp',
      [],
      { timeoutMs: 1000, maxOutputBytes: 100 },
      context(),
    );
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'TOOL_UNAVAILABLE',
      message: 'The video analysis tool is unavailable.',
    });
    child.emit('error', new Error('secret filesystem path'));
    await assertion;
  });
  it('stops active tool processes during graceful server shutdown', async () => {
    const child = childProcess();
    spawnMock.mockReturnValue(child);
    const pending = runTool(
      'yt-dlp',
      [],
      { timeoutMs: 1000, maxOutputBytes: 100 },
      context(),
    );
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'REQUEST_CANCELLED',
    });
    stopRunningTools();
    await assertion;
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });
});
describe('production yt-dlp analysis', () => {
  it('deduplicates identical delivered dimensions, sorts resolutions and prefers an explicitly clean compatible source', async () => {
    const source = fixture.formats[0];
    launch(
      JSON.stringify({
        ...fixture,
        formats: [
          { ...source, format_id: 'large', filesize: 4096, tbr: 1000 },
          {
            ...source,
            format_id: 'safe',
            format_note: 'No watermark',
            filesize: 2048,
            tbr: 1020,
          },
          { ...source, format_id: 'low', width: 576, height: 1024 },
          { ...source, format_id: 'high', width: 1080, height: 1920 },
          { ...source, format_id: 'high-bitrate', tbr: 2000 },
          { ...source, format_id: 'alternative', vcodec: 'hevc' },
          { ...source, format_id: 'unsafe+selector' },
        ],
      }),
    );
    const result = await new YtDlpAnalyzer().analyzeSource(url, context());
    expect(result.media.formats.map((format) => format.qualityLabel)).toEqual([
      '1080p',
      '720p',
      '576p',
    ]);
    expect([...result.selectors.values()]).toContain('safe');
    expect([...result.selectors.values()]).not.toContain('large');
    expect(
      result.media.formats.filter(
        (format) => format.compatibility === 'device-dependent',
      ),
    ).toHaveLength(0);
    expect(result.preferred?.has(result.media.formats[1]?.id ?? '')).toBe(true);
    expect(result.media.formats[1]?.hasAudio).toBe(true);
    expect(JSON.stringify(result.media)).not.toMatch(
      /high-bitrate|safe|unsafe\+selector|https:\/\/video/,
    );
  });
  it('excludes a clean variant without audio and keeps the honest watermarked MP4', async () => {
    launch(
      JSON.stringify({
        ...fixture,
        formats: [
          {
            ...fixture.formats[0],
            format_id: 'clean',
            format_note: 'No watermark',
            acodec: 'none',
          },
          { ...fixture.formats[0], format_id: 'watermarked', format_note: 'watermarked' },
        ],
      }),
    );
    const result = await new YtDlpAnalyzer().analyzeSource(url, context());
    expect([...result.selectors.values()]).toEqual(['watermarked']);
    expect(result.preferred?.size).toBe(0);
    expect(result.media.formats[0]?.hasAudio).toBe(true);
    expect(JSON.stringify(result.media)).not.toContain('watermarked');
  });
  it('keeps approved remote thumbnails private and excludes arbitrary or media URLs', async () => {
    const allowed = 'https://p16-sign.tiktokcdn.com/image.jpeg?signature=test';
    launch(JSON.stringify({ ...fixture, thumbnail: allowed }));
    const result = await new YtDlpAnalyzer().analyzeSource(url, context());
    expect(result.previewUrl).toBe(allowed);
    expect(result.media.thumbnail).toBeNull();
    for (const thumbnail of [
      'http://p16.tiktokcdn.com/image',
      'https://tiktokcdn.com.evil.test/image',
      'https://127.0.0.1/image',
      'https://user:pass@p16.tiktokcdn.com/image',
      'https://p16.tiktokcdn.com/movie.mp4',
      'https://p16%2etiktokcdn.com/image',
    ]) {
      expect(normalizeMetadata({ ...fixture, thumbnail }, url).thumbnail).toBeNull();
    }
  });
  it('passes only a normalized, validated URL and safe fixed options', async () => {
    launch(JSON.stringify(fixture));
    const result = await new YtDlpAnalyzer().analyze(
      'HTTPS://WWW.TIKTOK.COM/@creator/video/123',
      context(),
    );
    const args = spawnMock.mock.calls[0]?.[1];
    expect(args?.slice(-2)).toEqual(['--', url]);
    expect(args).toEqual(
      expect.arrayContaining([
        '--ignore-config',
        '--no-plugin-dirs',
        '--no-cookies',
        '--no-cookies-from-browser',
        '--no-geo-bypass',
        '--simulate',
        '--impersonate',
        'chrome',
        '--dump-single-json',
        '--no-playlist',
        '--use-extractors',
        'TikTok,TikTokVM',
      ]),
    );
    expect(result).toMatchObject({
      title: 'Source title',
      creator: 'Source creator',
      durationSeconds: 8.5,
      thumbnail: null,
      mock: false,
      downloadAvailable: false,
      sourceUrl: url,
    });
    expect(result.formats).toEqual([
      {
        id: 'source-1',
        container: 'mp4',
        qualityLabel: '720p',
        hasAudio: true,
        compatibility: 'broad',
        width: 720,
        height: 1280,
        estimatedBytes: 2048,
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /secret|http_headers|internal-selector|tiktokcdn|remote.test/,
    );
  });
  it('rejects unsafe URLs before spawning', async () => {
    await expect(
      new YtDlpAnalyzer().analyze('https://localhost/video', context()),
    ).rejects.toThrow();
    expect(spawnMock).not.toHaveBeenCalled();
  });
  it.each([
    ['This video is private; secret', 'VIDEO_NOT_PUBLIC'],
    ['Login required with cookies; secret', 'VIDEO_NOT_PUBLIC'],
    ['Video not available in your country; secret', 'REGION_RESTRICTED'],
    ['Video removed: 404; secret', 'VIDEO_UNAVAILABLE'],
    ['HTTP 429 too many requests; secret', 'SOURCE_RATE_LIMITED'],
    ['Unhandled extractor traceback; secret', 'EXTRACTOR_FAILED'],
  ])('maps extractor errors safely: %s', async (stderr, code) => {
    launch('', 1, stderr);
    const ctx = context();
    const log = vi.spyOn(ctx.logger, 'warn');
    await expect(new YtDlpAnalyzer().analyze(url, ctx)).rejects.toMatchObject({
      code,
      message: expect.not.stringContaining('secret'),
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'test-request-id', code }),
      expect.any(String),
    );
    if (['VIDEO_NOT_PUBLIC', 'REGION_RESTRICTED', 'SOURCE_RATE_LIMITED'].includes(code))
      expect(photoMock).not.toHaveBeenCalled();
  });
  it('checks actual photo metadata when a video-path extractor returns no video formats', async () => {
    launch(JSON.stringify({ ...fixture, formats: [] }));
    photoMock.mockResolvedValueOnce({
      media: { id: 'photo-source', postType: 'photo' },
      selectors: new Map(),
    });
    const result = await new YtDlpAnalyzer().analyzeSource(url, context());
    expect(result.media.postType).toBe('photo');
    expect(photoMock).toHaveBeenCalledWith(
      url,
      expect.any(AbortSignal),
      expect.any(Number),
    );
  });
  it.each(['not-json', '{}', '{"_type":"playlist"}'])(
    'rejects malformed or unsupported output: %s',
    async (output) => {
      launch(output);
      await expect(new YtDlpAnalyzer().analyze(url, context())).rejects.toMatchObject({
        code: 'INVALID_METADATA',
      });
    },
  );
  it('bounds concurrent analyses and releases slots after completion', async () => {
    const child = childProcess();
    spawnMock.mockReturnValue(child);
    const analyzer = new YtDlpAnalyzer({ ...config, ANALYSIS_MAX_CONCURRENT: 1 });
    const pending = analyzer.analyze(url, context());
    await expect(analyzer.analyze(url, context())).rejects.toMatchObject({
      code: 'ANALYSIS_BUSY',
    });
    child.stdout.write(JSON.stringify(fixture));
    child.emit('close', 0);
    await pending;
    launch(JSON.stringify(fixture));
    await expect(analyzer.analyze(url, context())).resolves.toHaveProperty('mock', false);
  });
  it('filters unsupported formats and never invents dimensions or sizes', () => {
    const source = fixture.formats[0];
    const result = normalizeMetadata(
      {
        ...fixture,
        duration: null,
        uploader: null,
        formats: [
          { ...source, ext: 'webm' },
          { ...source, protocol: 'm3u8_native' },
          { ...source, acodec: 'none' },
          { ...source, vcodec: 'none' },
          { ...source, acodec: 'unknown' },
          { ...source, url: 'https://127.0.0.1/file' },
          { ...source, url: 'https://[::1]/file' },
          { ...source, has_drm: true },
          { ...source, url: 'http://video.test/file' },
          { ...source, width: null, height: null, filesize: null, filesize_approx: 5000 },
        ],
      },
      url,
    );
    expect(result.formats).toEqual([
      {
        id: 'source-1',
        container: 'mp4',
        qualityLabel: 'Available MP4',
        hasAudio: true,
        compatibility: 'broad',
      },
    ]);
    expect(result.durationSeconds).toBeNull();
    expect(result.creator).toBeNull();
  });
  it('preserves real 4K dimensions only when returned and rejects restricted/live sources', () => {
    expect(
      normalizeMetadata(
        { ...fixture, formats: [{ ...fixture.formats[0], width: 3840, height: 2160 }] },
        url,
      ).formats[0],
    ).toMatchObject({ width: 3840, height: 2160 });
    expect(() => normalizeMetadata({ ...fixture, availability: 'private' }, url)).toThrow(
      'publicly accessible',
    );
    expect(() => normalizeMetadata({ ...fixture, is_live: true }, url)).toThrow(
      'Live video',
    );
    expect(() => normalizeMetadata({ ...fixture, formats: [] }, url)).toThrow(
      'No supported single-file',
    );
  });
});
describe('startup tools', () => {
  it('checks both executables using bounded version calls', async () => {
    launch('2026.10.01');
    launch('ffmpeg version test');
    launch('ffprobe version test');
    launch('Chrome-150 Windows-11 curl_cffi');
    launch(' A....D libmp3lame MP3 encoder');
    await expect(checkTools(context())).resolves.toEqual({
      ytDlp: true,
      ffmpeg: true,
      ffprobe: true,
      chrome: true,
      mp3: true,
    });
    expect(spawnMock.mock.calls[1]?.slice(0, 2)).toEqual(['ffmpeg', ['-version']]);
  });
  it('reports unavailable tools without throwing internal details', async () => {
    spawnMock.mockImplementation(() => {
      throw new Error('secret missing tool path');
    });
    await expect(checkTools(context())).resolves.toEqual({
      ytDlp: false,
      ffmpeg: false,
      ffprobe: false,
      chrome: false,
      mp3: false,
    });
  });
  it('rejects executables that return the wrong version banner', async () => {
    launch('v24.18.0');
    launch('not-ffmpeg');
    launch('not-ffprobe');
    await expect(checkTools(context())).resolves.toEqual({
      ytDlp: false,
      ffmpeg: false,
      ffprobe: false,
      chrome: false,
      mp3: false,
    });
  });
});
