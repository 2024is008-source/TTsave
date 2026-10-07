import { z } from 'zod';
import type { Analysis } from '../api/contracts.js';
import type { Environment } from '../config/env.js';
import { HttpError } from '../middleware/error-handler.js';
import { runTool, type AnalysisContext } from './tool-process.js';

const probeSchema = z.object({
  streams: z
    .array(
      z.object({
        codec_type: z.string(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
    )
    .max(20),
  format: z.object({ duration: z.coerce.number().positive(), format_name: z.string() }),
});
export async function verifyVideo(
  filename: string,
  selected: Analysis['formats'][number],
  config: Environment,
  context: AnalysisContext,
) {
  const result = await runTool(
    config.FFPROBE_PATH,
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration,format_name:stream=codec_type,width,height',
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
    const data = probeSchema.parse(JSON.parse(result.stdout) as unknown);
    const video = data.streams.find((stream) => stream.codec_type === 'video');
    context.logger.info(
      {
        requestId: context.requestId,
        jobId: context.jobId,
        stage: 'verification',
        expectedWidth: selected.width,
        expectedHeight: selected.height,
        actualWidth: video?.width,
        actualHeight: video?.height,
        hasAudio: data.streams.some((stream) => stream.codec_type === 'audio'),
        durationSeconds: data.format.duration,
        mp4: data.format.format_name.split(',').includes('mp4'),
      },
      'Downloaded video verification',
    );
    if (
      !video ||
      !data.streams.some((stream) => stream.codec_type === 'audio') ||
      !data.format.format_name.split(',').includes('mp4') ||
      (selected.width !== undefined && selected.width !== video.width) ||
      (selected.height !== undefined && selected.height !== video.height) ||
      data.format.duration > config.MAX_VIDEO_DURATION_SECONDS
    )
      throw new Error('Source changed');
    return video;
  } catch {
    throw new HttpError(
      502,
      'VIDEO_VERIFICATION_FAILED',
      'The source did not deliver the selected MP4 video with audio. Check the public link again.',
    );
  }
}
