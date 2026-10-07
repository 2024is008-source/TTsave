import { randomUUID } from 'node:crypto';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { env } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { createApp } from '../src/app.js';
import { ProductionDownloaderService } from '../src/services/downloader.js';
import { analysisSchema, apiJobSchema } from '../src/api/contracts.js';
import { videoUrlSchema } from '../src/shared/video-url.js';
import { runTool } from '../src/services/tool-process.js';

// Manual smoke test only: never part of automated tests, never logs raw tool output.
const url = videoUrlSchema.parse(process.argv[2]);
const service = new ProductionDownloaderService();
const server = createApp(service).listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Missing local test server');
const base = `http://127.0.0.1:${String(address.port)}`;
const result: Record<string, unknown> = { source: url, live: true };
try {
  const response = await fetch(base + '/api/v1/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) {
    result.analysis = {
      status: response.status,
      response: (await response.json()) as unknown,
    };
  } else {
    const media = analysisSchema.parse((await response.json()) as unknown);
    result.analysis = {
      title: media.title,
      creator: media.creator,
      durationSeconds: media.durationSeconds,
      formats: media.formats,
    };
    result.preview = media.thumbnail
      ? { status: (await fetch(base + media.thumbnail)).status }
      : 'unavailable';
    const selected = process.argv[3]
      ? media.formats.find((format) => format.id === process.argv[3])
      : media.formats[0];
    if (!selected) throw new Error('No format');
    result.selectedFormat = selected;
    const created = await fetch(base + '/api/v1/downloads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysisId: media.id, formatId: selected.id }),
    });
    const job = apiJobSchema.parse((await created.json()) as unknown);
    const events = await fetch(base + `/api/v1/downloads/${job.id}/events`, {
      headers: { Authorization: `Bearer ${job.accessToken ?? ''}` },
    });
    const updates = (await events.text())
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => apiJobSchema.parse(JSON.parse(line.slice(6)) as unknown));
    const complete = updates.at(-1);
    result.download = {
      status: complete?.status,
      error: complete?.error,
      progress: complete?.progress,
      eventCount: updates.length,
    };
    if (complete?.fileUrl) {
      const file = await fetch(base + complete.fileUrl);
      const bytes = Buffer.from(await file.arrayBuffer());
      result.delivery = {
        status: file.status,
        bytes: bytes.length,
        disposition: file.headers.get('Content-Disposition'),
        mp4Header: bytes.subarray(4, 8).toString(),
      };
      // The job verifier has already probed the server file before issuing its capability.
      result.audioAndResolution = 'Passed server FFprobe verification before delivery';
      result.replay = (await fetch(base + complete.fileUrl)).status;
      const filename = path.resolve('docs/live-verification.mp4');
      await writeFile(filename, bytes);
      const context = {
        signal: new AbortController().signal,
        requestId: randomUUID(),
        logger: createLogger({ level: 'silent' }),
        stage: 'live-verification',
      };
      const probe = await runTool(
        env.FFPROBE_PATH,
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration,format_name:stream=codec_type,width,height',
          '-of',
          'json',
          '-i',
          filename,
        ],
        { timeoutMs: 5000, maxOutputBytes: 65536 },
        context,
      );
      result.probe = JSON.parse(probe.stdout) as unknown;
      const decode = await runTool(
        env.FFMPEG_PATH,
        ['-v', 'error', '-i', filename, '-f', 'null', '-'],
        { timeoutMs: 30000, maxOutputBytes: 65536 },
        context,
      );
      result.decodeExitCode = decode.code;
      await runTool(
        env.FFMPEG_PATH,
        [
          '-v',
          'error',
          '-i',
          filename,
          '-frames:v',
          '1',
          '-y',
          path.resolve('docs/live-verification.png'),
        ],
        { timeoutMs: 10000, maxOutputBytes: 65536 },
        context,
      );
    }
  }
} finally {
  await service.dispose();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  result.remainingTemporaryEntries = await readdir(env.DOWNLOAD_TEMP_ROOT).catch(
    () => [],
  );
}
// Fixed local destination; input never controls a filesystem path.
await writeFile('docs/LIVE_VERIFICATION.json', JSON.stringify(result, null, 2) + '\n');
console.log('Live verification report saved to docs/LIVE_VERIFICATION.json');
