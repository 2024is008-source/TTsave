import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { env } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { ProductionDownloaderService } from '../src/services/downloader.js';
import { videoUrlSchema } from '../src/shared/video-url.js';
import { runTool } from '../src/services/tool-process.js';
import { checkTools } from '../src/services/tool-check.js';
import { z } from 'zod';
const source = videoUrlSchema.parse(process.argv[2]);
const mode = z.enum(['both', 'mp4', 'mp3']).default('both').parse(process.argv[3]);
const parent = path.resolve('node_modules/.cache');
const root = await mkdtemp(path.join(parent, 'media-live-'));
const context = {
  signal: new AbortController().signal,
  requestId: randomUUID(),
  logger: createLogger({ level: 'silent' }),
};
const tools = await checkTools(context);
const service = new ProductionDownloaderService(
  undefined,
  { ...env, DOWNLOAD_TEMP_ROOT: root },
  undefined,
  tools.mp3,
);
const report: Record<string, unknown> = { live: true, production: false };
try {
  const media = await service.analyze(source, context);
  report.kind = media.postType;
  report.formatCount = media.formats.length;
  report.usableAudio = media.capabilities?.mp3 === true;
  for (const type of mode === 'both' ? (['mp4', 'mp3'] as const) : [mode]) {
    report.phase = type;
    const job = service.createJob(
      media.id,
      media.formats.at(-1)?.id ?? '',
      context,
      type,
    );
    let state = service.getJob(job.id);
    const deadline = Date.now() + env.DOWNLOAD_TIMEOUT_MS + 2000;
    while (['queued', 'downloading'].includes(state.status) && Date.now() < deadline) {
      await setTimeout(50);
      state = service.getJob(job.id);
    }
    if (state.status !== 'ready') {
      report.jobErrorCode = state.error?.code ?? state.status;
      throw new Error('Media unavailable');
    }
    const claim = await service.claimFile(
      job.id,
      new URL(state.fileUrl ?? '', 'http://127.0.0.1').searchParams.get('token') ?? '',
    );
    try {
      const decoded = await runTool(
        env.FFMPEG_PATH,
        ['-nostdin', '-v', 'error', '-i', claim.path, '-f', 'null', '-'],
        {
          timeoutMs: 30000,
          maxOutputBytes: 65536,
          operation: 'download',
          waitForClose: true,
        },
        context,
      );
      if (decoded.code !== 0) throw new Error('Decode failed');
      report[type] = {
        fullDecodePassed: true,
        bytes: claim.size,
        mime: claim.contentType,
      };
    } finally {
      await claim.release(true);
    }
  }
  report.tempFilesAfterDelivery = (await readdir(root)).length;
  report.passed = true;
  report.phase = 'complete';
} catch {
  report.passed = false;
  report.error = 'The authorized live video could not complete MP4/MP3 verification.';
  process.exitCode = 1;
} finally {
  await service.dispose();
  if (path.dirname(root) !== parent || !path.basename(root).startsWith('media-live-'))
    process.exit(1);
  await rm(root, { recursive: true, force: true });
}
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
