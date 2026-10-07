import type { ErrorRequestHandler } from 'express';
import { treeifyError, ZodError } from 'zod';

export class HttpError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const status = error instanceof HttpError ? error.status : error instanceof ZodError ? 400 : 500;
  const code =
    error instanceof HttpError
      ? error.code
      : error instanceof ZodError
        ? 'VALIDATION_ERROR'
        : 'INTERNAL_SERVER_ERROR';
  const message =
    error instanceof HttpError
      ? error.message
      : error instanceof ZodError
        ? 'The request was invalid.'
        : 'An unexpected error occurred.';

  request.log.error(
    {
      err: error,
      requestId: request.id,
      status,
    },
    'Request failed',
  );

  response.status(status).json({
    error: {
      code,
      message,
      requestId: request.id,
      ...(error instanceof ZodError ? { details: treeifyError(error) } : {}),
    },
  });
};
