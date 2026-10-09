import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import sharp from 'sharp';
import { z } from 'zod';
import { env } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { ProductionDownloaderService } from '../src/services/downloader.js';
import { videoUrlSchema } from '../src/shared/video-url.js';

// Explicit manual owner-authorized source only. No media or capabilities are retained.
const source = videoUrlSchema.parse(process.argv[2]);
const parent = path.resolve('node_modules/.cache');
const root = await mkdtemp(path.join(parent, 'photo-live-'));
const service = new ProductionDownloaderService(undefined, {
  ...env,
  DOWNLOAD_TEMP_ROOT: root,
});
const context = {
  signal: new AbortController().signal,
  requestId: randomUUID(),
  logger: createLogger({ level: 'silent' }),
};
const report: Record<string, unknown> = { live: true, production: false };
try {
  const media = await service.analyze(source, context);
  report.photoCount = media.photos?.length ?? 0;
  report.phase = 'individual images';
  if (media.postType !== 'photo' || !media.photos?.length)
    throw new Error('Not a photo post');
  const deliver = async (ids: string[]) => {
    const job = service.createJob(
      media.id,
      ids[0] ?? '',
      context,
      'image',
      media.capability,
      ids,
    );
    let state = service.getJob(job.id);
    const deadline = Date.now() + 65000;
    while (['queued', 'downloading'].includes(state.status) && Date.now() < deadline) {
      await setTimeout(50);
      state = service.getJob(job.id);
    }
    if (state.status !== 'ready') {
      report.jobErrorCode = state.error?.code ?? state.status;
      throw new Error('Photo job did not become ready');
    }
    const token = z.url().parse(new URL(state.fileUrl ?? '', 'http://127.0.0.1').href);
    const claim = await service.claimFile(
      job.id,
      new URL(token).searchParams.get('token') ?? '',
    );
    let bytes: Buffer;
    try {
      bytes = await readFile(claim.path);
    } finally {
      await claim.release(true);
    }
    return { bytes, mime: claim.contentType };
  };
  let opened = 0;
  for (const photo of media.photos) {
    const file = await deliver([photo.id]);
    await sharp(file.bytes).raw().toBuffer();
    opened++;
  }
  report.individualImagesOpened = opened;
  report.phase = 'selected archive';
  const selected = [
    media.photos[0],
    media.photos[Math.floor(media.photos.length / 2)],
    media.photos.at(-1),
  ].filter((photo): photo is NonNullable<typeof photo> => !!photo);
  const ids = [...new Set(selected.map((photo) => photo.id))];
  const archive = await deliver([...ids].reverse());
  report.phase = 'archive inspection';
  const positions: number[] = [];
  let offset = 0;
  while (archive.bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = archive.bytes.readUInt32LE(offset + 18);
    const nameLength = archive.bytes.readUInt16LE(offset + 26);
    const extra = archive.bytes.readUInt16LE(offset + 28);
    const name = archive.bytes.subarray(offset + 30, offset + 30 + nameLength).toString();
    if (!/^[^/\\]+-\d+\.(jpg|png|webp)$/.test(name))
      throw new Error('Unsafe ZIP filename');
    positions.push(Number(/-(\d+)\./.exec(name)?.[1]));
    const start = offset + 30 + nameLength + extra;
    await sharp(archive.bytes.subarray(start, start + size))
      .raw()
      .toBuffer();
    offset = start + size;
  }
  const expected = selected
    .map((photo) => photo.position)
    .filter((position, index, all) => all.indexOf(position) === index)
    .sort((a, b) => a - b);
  if (JSON.stringify(positions) !== JSON.stringify(expected))
    throw new Error('ZIP order mismatch');
  report.archive = {
    verifiedEntries: positions.length,
    positions,
    mime: archive.mime,
    bytes: archive.bytes.length,
  };
  report.tempFilesAfterDelivery = (await readdir(root)).length;
  report.passed = true;
  report.phase = 'complete';
} catch {
  report.passed = false;
  report.error = 'The authorized live photo source could not complete verification.';
  process.exitCode = 1;
} finally {
  await service.dispose();
  if (path.dirname(root) !== parent || !path.basename(root).startsWith('photo-live-'))
    process.exit(1);
  await rm(root, { recursive: true, force: true });
}
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
