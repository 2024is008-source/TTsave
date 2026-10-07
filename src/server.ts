import type { Server } from 'node:http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const app = createApp();
let shuttingDown = false;

const server: Server = app.listen(env.PORT, env.HOST, () => {
  logger.info({ host: env.HOST, port: env.PORT }, 'TTSave server listening');
});

server.on('error', (error) => {
  logger.fatal({ err: error }, 'HTTP server failed');
  process.exit(1);
});

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');

  const forceShutdownTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000);
  forceShutdownTimer.unref();

  server.close((error) => {
    clearTimeout(forceShutdownTimer);
    if (error) {
      logger.error({ err: error }, 'HTTP server failed to close');
      process.exit(1);
    }
    logger.info('Graceful shutdown completed');
    process.exit(0);
  });

  server.closeIdleConnections();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
