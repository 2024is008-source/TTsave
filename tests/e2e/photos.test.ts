import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, safeRequestPath } from '../../src/app.js';
import { ProductionDownloaderService } from '../../src/services/downloader.js';
import { normalizePhotoPage } from '../../src/services/photo-metadata.js';
import { parseEnvironment } from '../../src/config/env.js';
import { analysisSchema, apiJobSchema } from '../../src/api/contracts.js';
const fetchImage = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/photo-images.js', async (original) => ({
  ...(await original<typeof import('../../src/services/photo-images.js')>()),
  fetchPhotoImage: fetchImage,
}));
const url = 'https://www.tiktok.com/@creator/photo/123';
let root: string;
let service: ProductionDownloaderService;
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'tiksavemp4-photo-test-'));
  const html = `<script id="SIGI_STATE">${JSON.stringify({ ItemModule: { '123': { id: '123', desc: 'Evening photos #fyp', author: { uniqueId: 'creator' }, imagePost: { images: [1, 2].map((id) => ({ imageURL: { urlList: [`https://p16.tiktokcdn.com/${String(id)}?signature=secret`] } })) } } } })}</script>`;
  service = new ProductionDownloaderService(
    { analyzeSource: () => Promise.resolve(normalizePhotoPage(html, url)) },
    parseEnvironment({
      DOWNLOAD_TEMP_ROOT: root,
      DOWNLOAD_MAX_CONCURRENT: '1',
      JOB_TTL_MS: '1000',
    }),
  );
  app = createApp(service);
  const bytes = await sharp({
    create: { width: 8, height: 12, channels: 3, background: '#ff3300' },
  })
    .png()
    .toBuffer();
  fetchImage.mockResolvedValue({
    bytes,
    extension: 'png',
    contentType: 'image/png',
    width: 8,
    height: 12,
  });
});
afterEach(async () => {
  await service.dispose();
  fetchImage.mockReset();
  if (
    path.dirname(root) !== path.resolve(tmpdir()) ||
    !path.basename(root).startsWith('tiksavemp4-photo-test-')
  )
    throw new Error('Unsafe test cleanup');
  await rm(root, { recursive: true, force: true });
});
async function analyze() {
  const response = await request(app).post('/api/v1/analyze').send({ url }).expect(200);
  return analysisSchema.parse(response.body as unknown);
}
it('returns ordered opaque previews, privately serves real image bytes, then removes delivered temporary files', async () => {
  const media = await analyze();
  expect(media.photos).toHaveLength(2);
  expect(media.formats).toEqual([]);
  expect(JSON.stringify(media)).not.toMatch(/signature|cookie|urlList/);
  const photo = media.photos?.[1];
  if (!photo) throw new Error('Missing photo');
  const preview = await request(app).get(photo.previewUrl).expect(200);
  expect(preview.headers['content-type']).toMatch(/^image\/png/);
  expect(preview.headers['cache-control']).toBe('private, no-store');
  const response = await request(app)
    .post('/api/v1/downloads')
    .send({
      analysisId: media.id,
      photoId: photo.id,
      capability: media.capability,
      downloadType: 'image',
    })
    .expect(201);
  const job = apiJobSchema.parse(response.body as unknown);
  await vi.waitFor(() => expect(service.getJob(job.id).status).toBe('ready'));
  const ready = service.getJob(job.id);
  if (!ready.fileUrl) throw new Error('Missing file');
  const file = await request(app).get(ready.fileUrl).expect(200);
  expect(file.headers['content-type']).toMatch(/^image\/png/);
  expect(file.headers['content-disposition']).toBe(
    'attachment; filename="creator-Evening-photos-02.png"; filename*=UTF-8\'\'creator-Evening-photos-02.png',
  );
  expect(file.headers['x-content-type-options']).toBe('nosniff');
  await vi.waitFor(async () => expect(await readdir(root)).toEqual([]));
  await request(app).get(ready.fileUrl).expect(409);
});
it('rejects unknown, mismatched and expired photo authorization and arbitrary client URLs', async () => {
  const first = await analyze();
  const second = await analyze();
  const photo = first.photos?.[0];
  if (!photo) throw new Error('Missing photo');
  const body = {
    analysisId: first.id,
    photoId: photo.id,
    capability: first.capability,
    downloadType: 'image',
  };
  await request(app)
    .post('/api/v1/downloads')
    .send({ ...body, url: 'https://evil.example/x' })
    .expect(400);
  await request(app)
    .post('/api/v1/downloads')
    .send({ ...body, capability: second.capability })
    .expect(403);
  await request(app)
    .post('/api/v1/downloads')
    .send({ ...body, photoId: second.photos?.[0]?.id })
    .expect(403);
  await request(app)
    .get(photo.previewUrl.replace(first.capability ?? '', second.capability ?? ''))
    .expect(403);
  await request(app)
    .post('/api/v1/downloads')
    .send({ ...body, photoId: '123e4567-e89b-42d3-a456-426614174000' })
    .expect(403);
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000);
  await request(app).get(photo.previewUrl).expect(403);
  await request(app).post('/api/v1/downloads').send(body).expect(404);
  vi.restoreAllMocks();
  expect(fetchImage).not.toHaveBeenCalled();
});
it('cleans failed and cancelled jobs, retains original concurrency limits and hides upstream errors', async () => {
  const media = await analyze();
  const photo = media.photos?.[0];
  if (!photo) throw new Error('Missing photo');
  const body = {
    analysisId: media.id,
    photoId: photo.id,
    capability: media.capability,
    downloadType: 'image',
  };
  fetchImage.mockRejectedValueOnce(
    new Error('https://p16.tiktokcdn.com/?signature=secret cookie server/path'),
  );
  const failed = apiJobSchema.parse(
    (await request(app).post('/api/v1/downloads').send(body).expect(201)).body as unknown,
  );
  await vi.waitFor(() => expect(service.getJob(failed.id).status).toBe('error'));
  expect(JSON.stringify(service.getJob(failed.id))).not.toMatch(
    /signature|cookie|server\/path/,
  );
  await vi.waitFor(async () => expect(await readdir(root)).toEqual([]));
  let aborted = false;
  fetchImage.mockImplementationOnce(
    (_url: string, signal: AbortSignal) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(new Error('aborted'));
          },
          { once: true },
        ),
      ),
  );
  const pending = apiJobSchema.parse(
    (await request(app).post('/api/v1/downloads').send(body).expect(201)).body as unknown,
  );
  await vi.waitFor(() => expect(service.getJob(pending.id).status).toBe('downloading'));
  await request(app).post('/api/v1/downloads').send(body).expect(503);
  await request(app)
    .delete(`/api/v1/downloads/${pending.id}`)
    .set('Authorization', `Bearer ${pending.accessToken ?? ''}`)
    .expect(200);
  await vi.waitFor(() => expect(aborted).toBe(true));
  await vi.waitFor(async () => expect(await readdir(root)).toEqual([]));
  expect(safeRequestPath(photo.previewUrl)).not.toContain(photo.id);
});
