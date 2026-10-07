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

  it('renders the foundation page', async () => {
    const response = await request(app).get('/').expect(200);

    expect(response.type).toBe('text/html');
    expect(response.text).toContain('TT<span class="brand">Save</span>');
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
