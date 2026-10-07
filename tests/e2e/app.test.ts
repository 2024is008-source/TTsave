import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { logger } from '../../src/config/logger.js';
import { errorHandler, HttpError } from '../../src/middleware/error-handler.js';
import { requestId } from '../../src/middleware/request-id.js';

describe('application routes', () => {
  const app = createApp();

  it('reports liveness', async () => {
    const response = await request(app).get('/health').expect(200);

    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('reports readiness', async () => {
    const response = await request(app).get('/ready').expect(200);

    expect(response.body).toEqual({ status: 'ready' });
  });

  it('renders the TTSave interface without fabricated media or inline scripts', async () => {
    const response = await request(app).get('/').expect(200);

    expect(response.type).toBe('text/html');
    expect(response.text).toContain('TT<span class="brand">Save</span>');
    expect(response.text).toContain('/assets/js/app.js');
    expect(response.text).toContain('Interface preview');
    expect(response.text).not.toMatch(
      /on(?:click|submit)=|cdn\.tailwindcss|sarah\.wanders|74%|5\.1 MB/,
    );
    expect(response.text).toMatch(/id="result-card"[\s\S]*?hidden/);
    expect(response.text).toMatch(/id="progress-card"[\s\S]*?hidden/);
  });

  it('rejects non-TikTok and malformed links', async () => {
    await request(app)
      .post('/analyze')
      .send({ url: 'https://example.com/video/1' })
      .expect(400);
    await request(app).post('/analyze').send({ url: 'not a URL' }).expect(400);
    await request(app)
      .post('/analyze')
      .send({ url: 'https://www.tiktok.com.evil.test/@a/video/123' })
      .expect(400);
  });

  it('returns the real preview availability for a syntactically valid video link', async () => {
    const response = await request(app)
      .post('/analyze')
      .send({ url: 'https://www.tiktok.com/@test/video/123' })
      .expect(503);
    expect(response.body.error.code).toBe('DOWNLOADER_UNAVAILABLE');
    expect(response.body.error.message).toContain('Downloads are not available yet');
  });

  it('returns a structured 404 response', async () => {
    const response = await request(app).get('/missing').expect(404);

    expect(response.body).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
        requestId: response.headers['x-request-id'],
      },
    });
  });

  it('returns a structured global error response without exposing internals', async () => {
    const errorApp = express();
    errorApp.use(requestId);
    errorApp.use((request, _response, next) => {
      request.log = logger;
      next();
    });
    errorApp.get('/failure', () => {
      throw new HttpError(503, 'DEPENDENCY_UNAVAILABLE', 'A dependency is unavailable.');
    });
    errorApp.use(errorHandler);

    const response = await request(errorApp).get('/failure').expect(503);

    expect(response.body).toEqual({
      error: {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'A dependency is unavailable.',
        requestId: response.headers['x-request-id'],
      },
    });
  });
});
