import pino, { type LoggerOptions } from 'pino';

import { env } from './env.js';

export function createLogger(options: LoggerOptions = {}) {
  return pino({
    level: env.LOG_LEVEL,
    base: { service: 'ttsave' },
    ...options,
  });
}

export const logger = createLogger();
