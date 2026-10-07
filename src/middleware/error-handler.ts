import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { safeUrlMessages } from '../shared/video-url.js';

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

  const malformed =
    error instanceof SyntaxError &&
    'type' in error &&
    error.type === 'entity.parse.failed';
  const tooLarge =
    error instanceof Error && 'type' in error && error.type === 'entity.too.large';
  const status =
    error instanceof HttpError
      ? error.status
      : error instanceof ZodError || malformed
        ? 400
        : tooLarge
          ? 413
          : 500;
  const code =
    error instanceof HttpError
      ? error.code
      : error instanceof ZodError || malformed
        ? 'VALIDATION_ERROR'
        : tooLarge
          ? 'PAYLOAD_TOO_LARGE'
          : 'INTERNAL_SERVER_ERROR';
  const message =
    error instanceof HttpError
      ? error.message
      : error instanceof ZodError || malformed
        ? 'The request was invalid.'
        : tooLarge
          ? 'The request body is too large.'
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
      retryable: status === 429 || status >= 500,
      fieldErrors:
        error instanceof ZodError
          ? Object.fromEntries(
              [
                ...new Set(error.issues.map((issue) => String(issue.path[0] ?? 'body'))),
              ].map((field) => [
                field,
                field === 'url'
                  ? [
                      ...new Set(
                        error.issues
                          .filter((issue) => issue.path[0] === field)
                          .map((issue) =>
                            safeUrlMessages.has(issue.message)
                              ? issue.message
                              : 'The supplied value is missing or invalid.',
                          ),
                      ),
                    ]
                  : ['The supplied value is missing or invalid.'],
              ]),
            )
          : {},
    },
  });
};
