import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import { createApp, safeRequestPath } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { logger } from '../../src/config/logger.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { requestId } from '../../src/middleware/request-id.js';

describe('production security regressions', () => {
  it('bounds expensive POST routes without blocking cancellation and health', async () => {
    const app = createApp();
    for (let index = 0; index < 10; index++) {
      await request(app)
        .post(index % 2 ? '/api/v1/downloads' : '/api/v1/analyze')
        .send({})
        .expect(400);
    }
    const limited = await request(app).post('/api/v1/analyze').send({}).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();
    await request(app).get('/health').expect(200);
    // An invalid job remains a 400, proving DELETE was not blocked by creation budget.
    await request(app).delete('/api/v1/downloads/invalid').expect(400);
  });
  it('does not log submitted secrets, parser bodies or unknown error stacks', async () => {
    const capture = vi.spyOn(logger, 'error');
    const app = express();
    app.use(requestId);
    app.use((req, _res, next) => {
      req.log = logger;
      next();
    });
    app.use(express.json());
    app.get('/failure', () => {
      throw new Error(
        'cookie=secret https://media.example/signed?token=secret /private/path',
      );
    });
    app.use(errorHandler);
    await request(app).get('/failure').expect(500);
    await request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"secret":"signed-url",')
      .expect(400);
    expect(capture).toHaveBeenCalled();
    expect(JSON.stringify(capture.mock.calls)).not.toMatch(
      /signed-url|cookie|private\/path|media\.example|stack|"err"/,
    );
    capture.mockRestore();
  });
  it('uses fixed log route labels rather than capabilities or arbitrary user paths', () => {
    expect(safeRequestPath('/api/v1/downloads/secret/file?token=secret')).toBe(
      '/api/v1/downloads/:id/file',
    );
    expect(safeRequestPath('/api/v1/analysis/secret/thumbnail?token=secret')).toBe(
      '/api/v1/analysis/:id/thumbnail',
    );
    expect(safeRequestPath('/https://media.example/cookie=secret')).toBe('/unmatched');
  });
  it('rejects oversized bodies and trusts only loopback Nginx peers', async () => {
    const previous = env.TRUST_PROXY;
    try {
      env.TRUST_PROXY = true;
      const app = createApp();
      const trust = app.get('trust proxy fn') as (address: string) => boolean;
      expect(trust('127.0.0.1')).toBe(true);
      expect(trust('::1')).toBe(true);
      expect(trust('8.8.8.8')).toBe(false);
      await request(app)
        .post('/api/v1/analyze')
        .send({ url: 'x'.repeat(33_000) })
        .expect(413);
    } finally {
      env.TRUST_PROXY = previous;
    }
  });
});
