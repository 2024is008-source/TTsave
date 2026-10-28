// Manual owner-authorized smoke test. Run after npm run build; never part of CI.
// Reports contain no source URL, provider output, job identifiers or capabilities.
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { env } from '../dist/config/env.js';
import { createLogger, logger } from '../dist/config/logger.js';
import { createApp } from '../dist/app.js';
import { ProductionDownloaderService } from '../dist/services/downloader.js';
import { checkTools } from '../dist/services/tool-check.js';
import { runTool } from '../dist/services/tool-process.js';
import { analysisSchema, apiJobSchema, apiErrorSchema } from '../dist/api/contracts.js';
import { videoUrlSchema } from '../dist/shared/video-url.js';

const target = z.enum(['local', 'production']).parse(process.argv[2]);
const source = videoUrlSchema.parse(process.argv[3]);
logger.level = 'silent';
// A local probe must never add synthetic audit requests to persistent counters.
if (target === 'local') env.OPERATIONS_ENABLED = false;
const root = await mkdtemp(path.join(tmpdir(), 'ttsave-http-audit-'));
const context = {
  signal: new AbortController().signal,
  requestId: randomUUID(),
  logger: createLogger({ level: 'silent' }),
};
const report = { checkedAt: new Date().toISOString(), target, passed: false, stages: [] };
let server,
  service,
  base = 'https://tiksavemp4.online';
const pending = new Map();
async function request(route, options = {}) {
  return fetch(new URL(route, base), {
    redirect: 'error',
    signal: AbortSignal.timeout(120000),
    ...options,
  });
}
async function json(response, schema) {
  const value = await response.json();
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(value);
    report.stages.push({
      phase: 'http-error',
      status: response.status,
      code: parsed.success ? parsed.data.error.code : 'UNEXPECTED_RESPONSE',
    });
    throw new Error('HTTP failure');
  }
  return schema.parse(value);
}
try {
  if (target === 'local') {
    const tools = await checkTools(context);
    if (!tools.mp3) throw new Error('Missing local tools');
    const config = { ...env, DOWNLOAD_TEMP_ROOT: path.join(root, 'jobs') };
    service = new ProductionDownloaderService(undefined, config, undefined, tools.mp3);
    server = createApp(service).listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const analysis = await json(
    await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: source }),
    }),
    analysisSchema,
  );
  report.stages.push({
    phase: 'analysis',
    kind: analysis.postType,
    formatCount: analysis.formats.length,
    mp3: analysis.capabilities?.mp3,
  });
  const selected = analysis.formats
    .filter((f) => f.hasAudio && f.container === 'mp4')
    .at(-1);
  if (!selected) throw new Error('No supported format');
  for (const type of ['mp4', 'mp3']) {
    const result = { phase: type, passed: false };
    report.stages.push(result);
    const job = await json(
      await request('/api/v1/downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId: analysis.id,
          downloadType: type,
          ...(type === 'mp4' ? { formatId: selected.id } : {}),
        }),
      }),
      apiJobSchema,
    );
    if (!job.accessToken || job.mock) throw new Error('Invalid real job');
    const route = `/api/v1/downloads/${job.id}`;
    const headers = { Authorization: `Bearer ${job.accessToken}` };
    pending.set(route, headers);
    let state = job;
    const deadline = Date.now() + 120000;
    while (['queued', 'downloading'].includes(state.status) && Date.now() < deadline) {
      await delay(1000);
      state = await json(await request(route, { headers }), apiJobSchema);
    }
    result.prepared = state.status;
    if (state.status !== 'ready' || !state.fileUrl) {
      result.code = state.error?.code ?? 'NOT_READY';
      // Test both types independently; never weaken the server's media verifier.
      await (await request(route, { method: 'DELETE', headers })).body?.cancel();
      pending.delete(route);
      continue;
    }
    const file = await request(state.fileUrl);
    result.http = file.status;
    result.mime = file.headers.get('content-type');
    result.noStore = /no-store/.test(file.headers.get('cache-control') ?? '');
    result.attachment = /^attachment;/.test(
      file.headers.get('content-disposition') ?? '',
    );
    const expected = Number(file.headers.get('content-length'));
    if (!file.ok || expected <= 0 || expected > 100 * 1024 * 1024)
      throw new Error('Invalid delivery');
    const chunks = [];
    let size = 0;
    for await (const chunk of file.body) {
      size += chunk.length;
      if (size > 100 * 1024 * 1024) throw new Error('Delivery limit');
      chunks.push(chunk);
    }
    const filename = path.join(root, `verified.${type}`);
    await writeFile(filename, Buffer.concat(chunks));
    const decoded = await runTool(
      env.FFMPEG_PATH,
      [
        '-nostdin',
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        filename,
        '-f',
        'null',
        '-',
      ],
      { timeoutMs: 30000, maxOutputBytes: 65536, waitForClose: true },
      context,
    );
    await delay(100);
    const delivered = await json(await request(route, { headers }), apiJobSchema);
    const replay = await request(state.fileUrl);
    result.replayStatus = replay.status;
    await replay.body?.cancel();
    result.bytes = size;
    result.lengthMatches = expected === size;
    result.fullDecodePassed = decoded.code === 0;
    result.finalStatus = delivered.status;
    result.passed =
      result.http === 200 &&
      result.mime === (type === 'mp3' ? 'audio/mpeg' : 'video/mp4') &&
      result.noStore &&
      result.attachment &&
      result.lengthMatches &&
      result.fullDecodePassed &&
      delivered.status === 'delivered' &&
      [404, 409, 410].includes(replay.status);
    pending.delete(route);
    await rm(filename);
  }
  report.passed =
    report.stages.filter((s) => ['mp4', 'mp3'].includes(s.phase)).length === 2 &&
    report.stages.filter((s) => ['mp4', 'mp3'].includes(s.phase)).every((s) => s.passed);
} catch {
  report.error =
    'Lifecycle did not complete; inspect sanitized stages, never publish capabilities or provider stderr.';
} finally {
  for (const [route, headers] of pending) {
    try {
      await (await request(route, { method: 'DELETE', headers })).body?.cancel();
    } catch {
      /* bounded best-effort cancellation of this probe's own job */
    }
  }
  if (service) {
    await service.dispose();
    report.localTempEntriesAfterShutdown = (
      await readdir(path.join(root, 'jobs')).catch(() => [])
    ).length;
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  if (
    path.dirname(root) !== tmpdir() ||
    !path.basename(root).startsWith('ttsave-http-audit-')
  )
    report.error = 'Unsafe cleanup target; temporary folder retained for inspection.';
  else await rm(root, { recursive: true, force: true });
}
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
if (!report.passed) process.exitCode = 1;
