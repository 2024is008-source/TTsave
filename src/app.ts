import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { publicRouter } from './routes/public.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { requestId } from './middleware/request-id.js';
import { createHealthRouter } from './routes/health.js';
import { analyzeRouter } from './routes/analyze.js';
import { createApiRouter } from './routes/api.js';
import type { DownloaderService } from './services/memory-store.js';
import { ProductionDownloaderService } from './services/downloader.js';
import { HttpError } from './middleware/error-handler.js';

/** Log route labels, never user-defined paths, queries or capability identifiers. */
export function safeRequestPath(value: string | undefined): string {
  const pathname = value?.split('?')[0] ?? '';
  if (/^\/api\/v1\/analysis\/[^/]+\/thumbnail\/?$/i.test(pathname))
    return '/api/v1/analysis/:id/thumbnail';
  if (/^\/api\/v1\/downloads\/[^/]+(?:\/(?:file|events))?\/?$/i.test(pathname))
    return pathname.toLowerCase().endsWith('/file')
      ? '/api/v1/downloads/:id/file'
      : pathname.toLowerCase().endsWith('/events')
        ? '/api/v1/downloads/:id/events'
        : '/api/v1/downloads/:id';
  const known = [
    '/',
    '/privacy',
    '/terms',
    '/copyright',
    '/responsible-use',
    '/contact',
    '/health',
    '/ready',
    '/robots.txt',
    '/sitemap.xml',
    '/analyze',
    '/api/v1/analyze',
    '/api/v1/downloads',
  ];
  if (known.includes(pathname)) return pathname;
  return pathname.startsWith('/assets/') ? '/assets/:asset' : '/unmatched';
}

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, '..');

export function createApp(
  service: DownloaderService = new ProductionDownloaderService(),
  isReady: () => boolean = () => true,
) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY ? 'loopback' : false);
  app.set('view engine', 'ejs');
  app.set('views', path.join(projectRoot, 'views'));

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (request) => request.id,
      serializers: {
        req: (request: { id?: unknown; method?: string; url?: string }) => ({
          id: request.id,
          method: request.method,
          url: safeRequestPath(request.url),
        }),
        res: (response: { statusCode?: number }) => ({ statusCode: response.statusCode }),
        err: () => ({ type: 'RequestError' }),
      },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          imgSrc: ["'self'"],
        },
      },
    }),
  );
  app.use((request, response, next) => {
    if (
      /^\/(?:api(?:\/|$)|analyze(?:\/|$)|health(?:\/|$)|ready(?:\/|$))/i.test(
        request.path,
      )
    ) {
      response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      response.setHeader('Cache-Control', 'no-store');
    }
    next();
  });
  app.use(createHealthRouter(isReady));
  // Static artwork must not consume the request budget for application routes.
  app.use(
    '/assets',
    express.static(path.join(projectRoot, 'public', 'assets'), {
      maxAge: '1h',
      // Filenames are stable, so revalidate after a short freshness window.
      immutable: false,
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 100,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_request, _response, next) =>
        next(
          new HttpError(
            429,
            'RATE_LIMITED',
            'Too many requests. Please try again later.',
          ),
        ),
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));

  const creationLimit = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (request) => request.method !== 'POST',
    handler: (_request, _response, next) =>
      next(
        new HttpError(
          429,
          'RATE_LIMITED',
          'Too many processing requests. Please try again later.',
        ),
      ),
  });
  app.use(['/api/v1/analyze', '/api/v1/downloads', '/analyze'], creationLimit);

  app.use(publicRouter);
  app.use(analyzeRouter);
  app.use('/api/v1', createApiRouter(service));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
