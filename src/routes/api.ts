import { Router } from 'express';
import type { ZodType } from 'zod';
import {
  analyzeInput,
  analysisSchema,
  apiJobSchema,
  downloadInput,
  jobParams,
} from '../api/contracts.js';
import { HttpError } from '../middleware/error-handler.js';
import type { DownloaderService } from '../services/memory-store.js';

function validateOutput<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error('Invalid service response');
  return parsed.data;
}

export function createApiRouter(service: DownloaderService) {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.post('/analyze', async (request, response) => {
    const input = analyzeInput.parse(request.body as unknown);
    const controller = new AbortController();
    const abort = () => controller.abort();
    const close = () => {
      if (!response.writableEnded) abort();
    };
    request.once('aborted', abort);
    response.once('close', close);
    try {
      const media = await service.analyze(input.url, {
        signal: controller.signal,
        requestId: typeof request.id === 'string' ? request.id : 'unknown-request',
        logger: request.log,
      });
      if (!controller.signal.aborted)
        response.json(validateOutput(analysisSchema, media));
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    } finally {
      request.off('aborted', abort);
      response.off('close', close);
    }
  });
  router.post('/downloads', (request, response) => {
    const input = downloadInput.parse(request.body as unknown);
    const job = validateOutput(
      apiJobSchema,
      service.createJob(input.analysisId, input.formatId),
    );
    response.location(`/api/v1/downloads/${job.id}`).status(201).json(job);
  });
  router.get('/downloads/:jobId', (request, response) => {
    const { jobId } = jobParams.parse(request.params);
    response.json(validateOutput(apiJobSchema, service.getJob(jobId)));
  });
  router.delete('/downloads/:jobId', (request, response) => {
    const { jobId } = jobParams.parse(request.params);
    response.json(validateOutput(apiJobSchema, service.cancel(jobId)));
  });
  router.get('/downloads/:jobId/file', (request) => {
    const { jobId } = jobParams.parse(request.params);
    service.getJob(jobId);
    throw new HttpError(
      409,
      'FILE_UNAVAILABLE',
      'The mock service does not produce video files.',
    );
  });
  router.get('/downloads/:jobId/events', (request, response) => {
    const { jobId } = jobParams.parse(request.params);
    const job = validateOutput(apiJobSchema, service.getJob(jobId));
    const send = (value: unknown) => {
      const update = validateOutput(apiJobSchema, value);
      response.write(`event: job\ndata: ${JSON.stringify(update)}\n\n`);
      if (update.status === 'cancelled') response.end();
    };
    const unsubscribe = service.subscribe(jobId, send);
    response.on('close', unsubscribe);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    send(job);
  });
  return router;
}
