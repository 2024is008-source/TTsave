import { randomUUID } from 'node:crypto';
import { logger } from './config/logger.js';
import { checkTools } from './services/tool-check.js';

const tools = await checkTools({
  signal: new AbortController().signal,
  requestId: randomUUID(),
  logger,
});
if (!tools.ytDlp || !tools.ffmpeg || !tools.ffprobe || !tools.chrome)
  process.exitCode = 1;
