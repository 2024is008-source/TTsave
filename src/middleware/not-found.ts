import type { RequestHandler } from 'express';
import { HttpError } from './error-handler.js';

export const notFound: RequestHandler = (request, response, next) => {
  if (
    ['GET', 'HEAD'].includes(request.method) &&
    request.get('Accept')?.includes('text/html') &&
    !/^\/(?:api|analyze|health|ready)(?:\/|$)/i.test(request.path)
  ) {
    response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.setHeader('Cache-Control', 'no-store');
    response.status(404).render('not-found', { page: { path: '' } });
    return;
  }
  next(new HttpError(404, 'NOT_FOUND', 'The requested resource was not found.'));
};
