import { once } from 'node:events';
import { mkdtemp, open, rm, stat, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';

// Owned synthetic fixtures only. No TikTok traffic or real user media.
process.env.LOG_LEVEL = 'silent';
const { createApp } = await import('../dist/app.js');
const { parseEnvironment } = await import('../dist/config/env.js');
const { runTool } = await import('../dist/services/tool-process.js');
const { convertMp3, verifyMp3 } = await import('../dist/services/mp3.js');
const { verifyVideo } = await import('../dist/services/verify-video.js');
const { createLogger } = await import('../dist/config/logger.js');
const root = await mkdtemp(path.join(tmpdir(), 'tiksavemp4-perf-'));
if (
  path.dirname(root) !== path.resolve(tmpdir()) ||
  !path.basename(root).startsWith('tiksavemp4-perf-')
)
  throw new Error('Unsafe cleanup');
let server;
const result = {
  measuredAt: new Date().toISOString(),
  platform: process.platform,
  node: process.version,
  scope: 'Local Windows; synthetic fixtures; no VPS or live TikTok evidence',
};
try {
  let fixture;
  let released = false;
  let finishDelivery;
  const service = {
    analyze() {
      throw new Error('Not used');
    },
    createJob() {
      throw new Error('Not used');
    },
    getJob() {
      throw new Error('Not used');
    },
    cancel() {
      throw new Error('Not used');
    },
    subscribe() {
      throw new Error('Not used');
    },
    async claimFile() {
      return {
        path: fixture,
        size: (await stat(fixture)).size,
        signal: new AbortController().signal,
        release: async (delivered) => {
          released = delivered;
          finishDelivery();
        },
      };
    },
  };
  server = createApp(service).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const timings = [];
  for (let index = 0; index < 21; index++) {
    const started = performance.now();
    const response = await fetch(base);
    await response.arrayBuffer();
    if (response.status !== 200) throw new Error('Homepage failed');
    if (index) timings.push(performance.now() - started);
  }
  timings.sort((a, b) => a - b);
  result.homepage = {
    samples: timings.length,
    medianMs: timings[10],
    p95Ms: timings[18],
    includes:
      'Loopback HTTP, EJS rendering and full response read; first warmup excluded',
  };
  result.streams = [];
  for (const size of [8, 64]) {
    fixture = path.join(root, `stream-${size}.bin`);
    const handle = await open(fixture, 'w');
    await handle.truncate(size * 1024 * 1024);
    await handle.close();
    const before = process.memoryUsage().rss;
    let peak = before;
    const timer = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().rss);
    }, 5);
    const started = performance.now();
    let bytes = 0;
    released = false;
    const delivery = new Promise((resolve) => {
      finishDelivery = resolve;
    });
    try {
      const response = await fetch(
        `${base}/api/v1/downloads/123e4567-e89b-42d3-a456-426614174000/file?token=${'a'.repeat(43)}`,
      );
      if (response.status !== 200) throw new Error(`Stream failed ${response.status}`);
      for await (const chunk of response.body) bytes += chunk.byteLength;
      await delivery;
      if (!released || bytes !== size * 1024 * 1024)
        throw new Error('Delivery incomplete');
    } finally {
      clearInterval(timer);
    }
    result.streams.push({
      fixtureMiB: size,
      bytes,
      elapsedMs: performance.now() - started,
      rssBeforeBytes: before,
      sampledPeakRssBytes: peak,
      rssDeltaBytes: peak - before,
      deliveryReleased: released,
      note: 'Non-media sparse fixture through real HTTP pipeline. Client and server share process; RSS includes fetch buffers and GC, not server-only memory.',
    });
    await rm(fixture);
  }
  const assets = ['public/assets/app.css', 'public/assets/js/downloader.js'];
  result.assets = await Promise.all(
    assets.map(async (filename) => {
      const data = await readFile(filename);
      return { filename, bytes: data.length, gzipBytes: gzipSync(data).length };
    }),
  );
  result.imageBytes = (
    await Promise.all(
      (await readdir('public/assets/images')).map(
        async (name) => (await stat(path.join('public/assets/images', name))).size,
      ),
    )
  ).reduce((a, b) => a + b, 0);
  const config = parseEnvironment();
  const context = {
    signal: new AbortController().signal,
    requestId: 'synthetic-performance',
    logger: createLogger({ level: 'silent' }),
  };
  const source = path.join(root, 'source.mp4');
  const limits = {
    timeoutMs: 60000,
    maxOutputBytes: 65536,
    operation: 'download',
    waitForClose: true,
  };
  const generation = await runTool(
    config.FFMPEG_PATH,
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=64x64:r=10',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=60',
      '-t',
      '60',
      '-c:v',
      'mpeg4',
      '-c:a',
      'aac',
      '-shortest',
      source,
    ],
    limits,
    context,
  );
  if (generation.code !== 0) throw new Error('Generation failed');
  await verifyVideo(
    source,
    {
      id: 'synthetic',
      container: 'mp4',
      qualityLabel: '64 × 64 synthetic pixels',
      width: 64,
      height: 64,
      hasAudio: true,
    },
    config,
    context,
  );
  const videoDecode = await runTool(
    config.FFMPEG_PATH,
    ['-nostdin', '-v', 'error', '-i', source, '-f', 'null', '-'],
    limits,
    context,
  );
  if (videoDecode.code !== 0) throw new Error('Synthetic MP4 decode failed');
  result.mp4Smoke = {
    source: 'Owned offline synthetic MP4 with audio',
    dimensions: '64 × 64',
    durationSeconds: 60,
    productionProbePassed: true,
    fullDecodePassed: true,
    note: 'Does not verify live yt-dlp extraction or production downloads',
  };
  const started = performance.now();
  await Promise.all(
    [0, 1].map(async (index) => {
      const output = path.join(root, `audio-${index}.mp3`);
      await convertMp3(source, output, config, context);
      await verifyMp3(output, config, context);
    }),
  );
  result.conversion = {
    concurrency: 2,
    sourceDurationSeconds: 60,
    elapsedMs: performance.now() - started,
    files: await Promise.all(
      (await readdir(root)).map(async (name) => ({
        name,
        bytes: (await stat(path.join(root, name))).size,
      })),
    ),
  };
  const benchmark = await runTool(
    config.FFMPEG_PATH,
    [
      '-nostdin',
      '-hide_banner',
      '-benchmark',
      '-i',
      source,
      '-map',
      '0:a:0',
      '-vn',
      '-map_metadata',
      '-1',
      '-map_chapters',
      '-1',
      '-c:a',
      'libmp3lame',
      '-q:a',
      '2',
      '-f',
      'null',
      '-',
    ],
    limits,
    context,
  );
  if (benchmark.code !== 0) throw new Error('CPU benchmark failed');
  const cpu = /utime=([\d.]+)s stime=([\d.]+)s rtime=([\d.]+)s/.exec(benchmark.stderr);
  const memory = /maxrss=(\d+)KiB/.exec(benchmark.stderr);
  result.ffmpegBenchmark = {
    userSeconds: cpu ? Number(cpu[1]) : null,
    systemSeconds: cpu ? Number(cpu[2]) : null,
    wallSeconds: cpu ? Number(cpu[3]) : null,
    maxRssKiB: memory ? Number(memory[1]) : null,
    note: 'Separate FFmpeg null-output encode with production MP3 options; platform-reported metrics, not VPS capacity',
  };
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await rm(root, { recursive: true, force: true });
}
result.cleanupPassed = await stat(root).then(
  () => false,
  () => true,
);
await writeFile('docs/PERFORMANCE_AUDIT.json', JSON.stringify(result, null, 2) + '\n');
process.stdout.write('Local synthetic performance evidence saved; fixtures removed.\n');
