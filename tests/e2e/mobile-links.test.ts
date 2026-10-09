import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { ProductionDownloaderService } from '../../src/services/downloader.js';
import { YtDlpAnalyzer } from '../../src/services/yt-dlp.js';
import { parseEnvironment } from '../../src/config/env.js';
import { createLogger } from '../../src/config/logger.js';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn(), spawn: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
const full = 'https://www.tiktok.com/@creator/video/123';
const services: ProductionDownloaderService[] = [];
beforeEach(() => {
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  mocks.spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(() => true),
    });
    queueMicrotask(() => {
      child.stdout.end(
        JSON.stringify({
          extractor_key: 'TikTok',
          availability: 'public',
          title: 'Public source',
          uploader: 'Creator',
          duration: 12,
          http_headers: { Cookie: 'private' },
          formats: [
            {
              format_id: 'source',
              ext: 'mp4',
              protocol: 'https',
              url: 'https://video.tiktokcdn.com/file.mp4?signature=private',
              vcodec: 'h264',
              acodec: 'aac',
            },
          ],
        }),
      );
      child.emit('close', 0);
    });
    return child;
  });
});
afterEach(async () => {
  for (const service of services) await service.dispose();
  services.length = 0;
  mocks.lookup.mockReset();
  mocks.request.mockReset();
  mocks.spawn.mockReset();
});
function response(status: number, location?: string) {
  mocks.request.mockImplementationOnce(
    (_url: unknown, _options: unknown, callback: (value: unknown) => void) => {
      const req = Object.assign(new EventEmitter(), {
        end: () =>
          queueMicrotask(() => {
            callback(
              Object.assign(new PassThrough(), {
                statusCode: status,
                headers: { ...(location ? { location } : {}) },
              }),
            );
            req.emit('close');
          }),
      });
      return req;
    },
  );
}
function app() {
  const service = new ProductionDownloaderService();
  services.push(service);
  return createApp(service);
}
it.each(['vm', 'vt'])(
  'analyzes a %s shared link through the existing route with canonical output',
  async (host) => {
    response(302, full + '/?share_token=private');
    response(200);
    const result = await request(app())
      .post('/api/v1/analyze')
      .set('Cookie', 'browser-secret')
      .set('Authorization', 'Bearer browser-secret')
      .set('X-User-Header', 'browser-secret')
      .send({ url: `https://${host}.tiktok.com/Zabc/` })
      .expect(200);
    expect(result.body).toMatchObject({
      sourceUrl: full,
      title: 'Public source',
      downloadAvailable: true,
    });
    const args = mocks.spawn.mock.calls[0]?.[1] as string[];
    expect(args.slice(-2)).toEqual(['--', full]);
    expect(
      JSON.stringify(mocks.request.mock.calls.map((call) => call[1] as unknown)),
    ).not.toMatch(/browser-secret|share_token|Cookie|Authorization|X-User-Header/);
    expect(result.text).not.toMatch(/private|tiktokcdn|signature|http_headers/);
  },
);
it('rejects an external redirect safely before starting extraction', async () => {
  response(302, 'https://attacker.example/private?cookie=secret');
  const result = await request(app())
    .post('/api/v1/analyze')
    .send({ url: 'https://vm.tiktok.com/Zabc/' })
    .expect(502);
  expect(result.body.error.code).toBe('SHORT_LINK_FAILED');
  expect(result.text).not.toMatch(/attacker|secret|cookie|stack/);
  expect(mocks.spawn).not.toHaveBeenCalled();
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it('rejects a private IPv6 destination safely before any network connection', async () => {
  mocks.lookup.mockResolvedValue([{ address: 'fd00:ec2::254', family: 6 }]);
  const result = await request(app())
    .post('/api/v1/analyze')
    .send({ url: 'https://vt.tiktok.com/Zabc/' })
    .expect(502);
  expect(result.text).not.toMatch(/fd00|254|internal/);
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.spawn).not.toHaveBeenCalled();
});
it('keeps resolution inside the existing analysis concurrency slot and releases it on cancellation', async () => {
  const config = parseEnvironment({ ANALYSIS_MAX_CONCURRENT: '1' });
  const analyzer = new YtDlpAnalyzer(config);
  mocks.lookup.mockReturnValueOnce(new Promise(() => undefined));
  const controller = new AbortController();
  const context = {
    requestId: 'short-link-test',
    signal: controller.signal,
    logger: createLogger({ level: 'silent' }),
  };
  const first = analyzer.analyzeSource('https://vm.tiktok.com/Zabc/', context);
  const assertion = expect(first).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
  await expect(analyzer.analyzeSource(full, context)).rejects.toMatchObject({
    code: 'ANALYSIS_BUSY',
  });
  controller.abort();
  await assertion;
  await expect(
    analyzer.analyzeSource(full, { ...context, signal: new AbortController().signal }),
  ).resolves.toMatchObject({ media: { sourceUrl: full } });
});
