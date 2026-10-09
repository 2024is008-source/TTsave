import { Router, type Request } from 'express';
import { z, type ZodType } from 'zod';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import {
  analyzeInput,
  analysisSchema,
  apiJobSchema,
  compatibleDownloadInput,
  jobParams,
  fileQuery,
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
  const authorize = (request: Request, id: string) => {
    const parsed = z
      .string()
      .regex(/^Bearer [A-Za-z0-9_-]{43}$/i)
      .safeParse(request.get('Authorization'));
    service.authorizeJob?.(id, parsed.success ? parsed.data.slice(7) : undefined);
  };
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
  router.get('/analysis/:analysisId/thumbnail', async (request, response) => {
    const { analysisId } = z.object({ analysisId: z.uuid() }).parse(request.params);
    const { token } = fileQuery.parse(request.query);
    if (!service.getThumbnail)
      throw new HttpError(
        404,
        'PREVIEW_UNAVAILABLE',
        'The video preview is unavailable.',
      );
    const bytes = await service.getThumbnail(analysisId, token);
    response.setHeader('Content-Type', 'image/webp');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Disposition', 'inline; filename="preview.webp"');
    response.send(bytes);
  });
  router.post('/downloads', (request, response) => {
    const input = compatibleDownloadInput.parse(request.body as unknown);
    const controller = new AbortController();
    const close = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.once('close', close);
    response.once('finish', () => response.off('close', close));
    const job = validateOutput(
      apiJobSchema,
      service.createJob(
        input.analysisId,
        input.downloadType === 'mp4' ? input.formatId : '',
        {
          signal: controller.signal,
          requestId: typeof request.id === 'string' ? request.id : 'unknown-request',
          logger: request.log,
        },
        input.downloadType,
      ),
    );
    response.location(`/api/v1/downloads/${job.id}`).status(201).json(job);
  });
  router.get('/downloads/:jobId', (request, response) => {
    const { jobId } = jobParams.parse(request.params);
    authorize(request, jobId);
    response.json(validateOutput(apiJobSchema, service.getJob(jobId)));
  });
  router.delete('/downloads/:jobId', (request, response) => {
    const { jobId } = jobParams.parse(request.params);
    authorize(request, jobId);
    response.json(validateOutput(apiJobSchema, service.cancel(jobId)));
  });
  router.get('/downloads/:jobId/file', async (request, response) => {
    const { jobId } = jobParams.parse(request.params);
    if (service.claimFile) {
      if (request.method !== 'GET')
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use GET to request this file.');
      if (request.get('Range'))
        throw new HttpError(
          416,
          'RANGE_UNSUPPORTED',
          'Resume is not supported for this single-use download.',
        );
      const { token } = fileQuery.parse(request.query);
      const claim = await service.claimFile(jobId, token);
      let delivered = false;
      try {
        response.setHeader('Content-Type', claim.contentType ?? 'video/mp4');
        response.setHeader('Content-Length', claim.size);
        response.setHeader(
          'Content-Disposition',
          `attachment; filename="${claim.filename ?? 'TikSaveMp4-video.mp4'}"`,
        );
        response.setHeader('Cache-Control', 'private, no-store');
        response.setHeader('Accept-Ranges', 'none');
        await pipeline(createReadStream(claim.path), response, { signal: claim.signal });
        delivered = true;
      } catch (error) {
        if (!response.headersSent && !response.destroyed) throw error;
      } finally {
        await claim.release(delivered);
      }
      return;
    }
    service.getJob(jobId);
    throw new HttpError(
      409,
      'FILE_UNAVAILABLE',
      'The mock service does not produce video files.',
    );
  });
  router.get('/downloads/:jobId/events', (request, response) => {
    const { jobId } = jobParams.parse(request.params);
    authorize(request, jobId);
    const job = validateOutput(apiJobSchema, service.getJob(jobId));
    const send = (value: unknown) => {
      if (response.writableEnded || response.destroyed) return;
      const update = validateOutput(apiJobSchema, value);
      response.write(`event: job\ndata: ${JSON.stringify(update)}\n\n`);
      if (['ready', 'delivered', 'cancelled', 'error', 'expired'].includes(update.status))
        response.end();
      else if (response.writableLength > 65_536) response.destroy();
    };
    const unsubscribe = service.subscribe(jobId, send);
    const heartbeat = setInterval(() => {
      if (!response.writableEnded && !response.destroyed)
        response.write(': keepalive\n\n');
    }, 15_000);
    heartbeat.unref();
    response.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    send(job);
  });
  return router;
}
