import { downloadFilename } from './filename.js';
import { z } from 'zod';
import type { Environment } from '../config/env.js';
import { HttpError } from '../middleware/error-handler.js';
import { runTool, type AnalysisContext } from './tool-process.js';

export function audioFilename(creator: string | null, title: string): string {
  return downloadFilename(title, creator, 'mp3');
}

export async function convertMp3(
  input: string,
  output: string,
  config: Environment,
  context: AnalysisContext,
) {
  const result = await runTool(
    config.FFMPEG_PATH,
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      input,
      '-map',
      '0:a:0',
      '-vn',
      '-map_metadata',
      '-1',
      '-map_chapters',
      '-1',
      '-c:a',
      'libmp3lame',
      '-q:a',
      '2',
      '-f',
      'mp3',
      output,
    ],
    {
      timeoutMs: config.DOWNLOAD_TIMEOUT_MS,
      maxOutputBytes: 65_536,
      operation: 'download',
      waitForClose: true,
    },
    { ...context, stage: 'conversion' },
  );
  if (result.code !== 0)
    throw new HttpError(
      502,
      'AUDIO_CONVERSION_FAILED',
      'The audio could not be converted. Please try again later.',
    );
}

const audioProbe = z.object({
  streams: z.array(z.object({ codec_type: z.string(), codec_name: z.string() })).max(20),
  format: z.object({ duration: z.coerce.number().positive(), format_name: z.string() }),
});
export async function verifyMp3(
  filename: string,
  config: Environment,
  context: AnalysisContext,
) {
  const result = await runTool(
    config.FFPROBE_PATH,
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration,format_name:stream=codec_type,codec_name',
      '-of',
      'json',
      '-i',
      filename,
    ],
    {
      timeoutMs: 5000,
      maxOutputBytes: 65_536,
      operation: 'download',
      waitForClose: true,
    },
    { ...context, stage: 'verification' },
  );
  try {
    if (result.code !== 0) throw new Error('Probe failed');
    const data = audioProbe.parse(JSON.parse(result.stdout) as unknown);
    if (
      data.format.format_name !== 'mp3' ||
      data.streams.length !== 1 ||
      data.streams[0]?.codec_type !== 'audio' ||
      data.streams[0].codec_name !== 'mp3' ||
      data.format.duration > config.MAX_VIDEO_DURATION_SECONDS + 1
    )
      throw new Error('Invalid audio');
  } catch {
    throw new HttpError(
      502,
      'AUDIO_VERIFICATION_FAILED',
      'The audio could not be converted into a valid MP3.',
    );
  }
}
