import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { URL_MESSAGES } from '../../src/shared/video-url.js';
import { createApp } from '../../src/app.js';
import { analysisSchema, apiJobSchema, apiErrorSchema } from '../../src/api/contracts.js';
import { MockDownloaderService } from '../../src/services/mock-downloader.js';

const url = 'https://www.tiktok.com/@test/video/123';
async function analyze(app: ReturnType<typeof createApp>) {
  const response = await request(app).post('/api/v1/analyze').send({ url }).expect(200);
  return analysisSchema.parse(response.body as unknown);
}
async function createJob(app: ReturnType<typeof createApp>) {
  const analysis = await analyze(app);
  const response = await request(app)
    .post('/api/v1/downloads')
    .send({ analysisId: analysis.id, formatId: analysis.formats[0]?.id })
    .expect(201);
  return apiJobSchema.parse(response.body as unknown);
}
describe('versioned mock API', () => {
  it('normalizes approved mobile host casing before invoking the service', async () => {
    const service = new MockDownloaderService();
    const spy = vi.spyOn(service, 'analyze');
    const response = await request(createApp(service))
      .post('/api/v1/analyze')
      .send({ url: '  HTTPS://M.TikTok.COM/@Creator/video/123  ' })
      .expect(200);
    expect(analysisSchema.parse(response.body as unknown).sourceUrl).toBe(
      'https://m.tiktok.com/@Creator/video/123',
    );
    expect(spy).toHaveBeenCalledWith('https://m.tiktok.com/@Creator/video/123');
  });
  it.each([
    '@creator',
    'https://tiktok.com.evil.test/@creator/video/123',
    'https://attacker.tiktok.com/@creator/video/123',
    'https://%74iktok.com/@creator/video/123',
    'https://localhost/@creator/video/123',
    'https://192.168.1.1/@creator/video/123',
    'https://[::1]/@creator/video/123',
    'https://[fc00::1]/@creator/video/123',
    'http://tiktok.com/@creator/video/123',
    'https://user:secret@tiktok.com/@creator/video/123',
    'https:///tiktok.com/@creator/video/123',
    'x'.repeat(2049),
  ])('rejects unsafe links before invoking any analysis service: %s', async (input) => {
    const service = new MockDownloaderService();
    const spy = vi.spyOn(service, 'analyze');
    const response = await request(createApp(service))
      .post('/api/v1/analyze')
      .send({ url: input })
      .expect(400);
    const error = apiErrorSchema.parse(response.body as unknown).error;
    expect(error.fieldErrors.url?.[0]).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
    expect(response.text).not.toContain('secret');
  });
  it('returns friendly missing-link feedback', async () => {
    const response = await request(createApp())
      .post('/api/v1/analyze')
      .send({})
      .expect(400);
    expect(apiErrorSchema.parse(response.body as unknown).error.fieldErrors.url).toEqual([
      URL_MESSAGES.required,
    ]);
  });
  it('returns complete, explicitly mocked analysis without invented source metrics', async () => {
    const app = createApp();
    const media = await analyze(app);
    expect(media).toMatchObject({
      title: 'Mock API preview — not analyzed TikTok content',
      creator: null,
      thumbnail: null,
      durationSeconds: null,
      sourceUrl: url,
      mock: true,
    });
    expect(media.formats).toEqual([
      {
        id: 'mock-mp4',
        container: 'mp4',
        qualityLabel: 'Mock format — file unavailable',
        hasAudio: false,
      },
    ]);
  });
  it.each([
    { url: 'https://example.com/video/1' },
    {},
    { url: 'https://user:password@tiktok.com/@test/video/123' },
    { url, filename: 'evil.mp4' },
  ])('rejects missing, unsafe and extra input: %j', async (input) => {
    const response = await request(createApp())
      .post('/api/v1/analyze')
      .send(input)
      .expect(400);
    const { error } = apiErrorSchema.parse(response.body as unknown);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.retryable).toBe(false);
    expect(Object.keys(error.fieldErrors).length).toBeGreaterThan(0);
    expect(error.requestId).toBe(response.headers['x-request-id']);
  });
  it('creates and looks up a job for a returned format', async () => {
    const app = createApp();
    const job = await createJob(app);
    expect(job.status).toBe('queued');
    const found = await request(app).get(`/api/v1/downloads/${job.id}`).expect(200);
    expect(apiJobSchema.parse(found.body as unknown)).toEqual(job);
  });
  it('rejects unknown formats and user-selected server paths', async () => {
    const app = createApp();
    const media = await analyze(app);
    await request(app)
      .post('/api/v1/downloads')
      .send({ analysisId: media.id, formatId: 'invented' })
      .expect(400);
    await request(app)
      .post('/api/v1/downloads')
      .send({ analysisId: media.id, formatId: 'mock-mp4', path: 'C:/tmp' })
      .expect(400);
  });
  it('cancels idempotently and emits the cancelled state through SSE', async () => {
    const app = createApp();
    const job = await createJob(app);
    const cancelled = await request(app)
      .delete(`/api/v1/downloads/${job.id}`)
      .expect(200);
    expect(apiJobSchema.parse(cancelled.body as unknown).status).toBe('cancelled');
    await request(app).delete(`/api/v1/downloads/${job.id}`).expect(200);
    const events = await request(app)
      .get(`/api/v1/downloads/${job.id}/events`)
      .expect(200);
    expect(events.headers['content-type']).toContain('text/event-stream');
    expect(events.text).toContain('event: job\n');
    expect(events.text).toContain('"status":"cancelled"');
    const lookup = await request(app).get(`/api/v1/downloads/${job.id}`).expect(200);
    expect(apiJobSchema.parse(lookup.body as unknown).status).toBe('cancelled');
  });
  it('returns safe errors for missing jobs on every job endpoint', async () => {
    const app = createApp();
    const id = randomUUID();
    for (const suffix of ['', '/events', '/file']) {
      const response = await request(app)
        .get(`/api/v1/downloads/${id}${suffix}`)
        .expect(404);
      expect(apiErrorSchema.parse(response.body as unknown).error.code).toBe(
        'JOB_NOT_FOUND',
      );
    }
    await request(app).delete(`/api/v1/downloads/${id}`).expect(404);
    await request(app).get('/api/v1/downloads/not-an-id').expect(400);
  });
  it('never manufactures a downloadable file', async () => {
    const app = createApp();
    const job = await createJob(app);
    const response = await request(app)
      .get(`/api/v1/downloads/${job.id}/file`)
      .expect(409);
    expect(apiErrorSchema.parse(response.body as unknown).error).toMatchObject({
      code: 'FILE_UNAVAILABLE',
      retryable: false,
      fieldErrors: {},
    });
  });
  it('hides internal exception messages and stack traces', async () => {
    class BrokenService extends MockDownloaderService {
      override analyze(): never {
        throw new Error('secret database path C:/private and credentials');
      }
    }
    const response = await request(createApp(new BrokenService()))
      .post('/api/v1/analyze')
      .send({ url })
      .expect(500);
    expect(apiErrorSchema.parse(response.body as unknown).error).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
      retryable: true,
      fieldErrors: {},
      requestId: response.headers['x-request-id'],
    });
    expect(response.text).not.toMatch(/secret|credentials|stack|private/);
  });
  it('handles malformed JSON without exposing parser details', async () => {
    const response = await request(createApp())
      .post('/api/v1/analyze')
      .set('Content-Type', 'application/json')
      .send('{bad-json')
      .expect(400);
    expect(apiErrorSchema.parse(response.body as unknown).error.code).toBe(
      'VALIDATION_ERROR',
    );
    expect(response.text).not.toContain('bad-json');
  });
});
