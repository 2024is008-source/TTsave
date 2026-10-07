import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { mockData } from './data/mock-data.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { requestId } from './middleware/request-id.js';
import { healthRouter } from './routes/health.js';
import { analyzeRouter } from './routes/analyze.js';
import { createApiRouter } from './routes/api.js';
import {
  MockDownloaderService,
  type DownloaderService,
} from './services/mock-downloader.js';
import { HttpError } from './middleware/error-handler.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, '..');

export function createApp(service: DownloaderService = new MockDownloaderService()) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.set('view engine', 'ejs');
  app.set('views', path.join(projectRoot, 'views'));

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (request) => request.id,
    }),
  );
  app.use(helmet());
  app.use(healthRouter);
  // Static artwork must not consume the request budget for application routes.
  app.use('/assets', express.static(path.join(projectRoot, 'public', 'assets')));
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

  app.get('/', (_request, response) => {
    response.render('index', mockData);
  });
  app.use(analyzeRouter);
  app.use('/api/v1', createApiRouter(service));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
