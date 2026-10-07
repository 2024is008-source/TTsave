import type { RequestHandler } from 'express';
import { HttpError } from './error-handler.js';

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new HttpError(404, 'NOT_FOUND', 'The requested resource was not found.'));
};
