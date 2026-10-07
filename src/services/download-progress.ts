import { z } from 'zod';
import type { ApiJob } from '../api/contracts.js';
import { HttpError } from '../middleware/error-handler.js';

export const PROGRESS_PREFIX = 'TTSave:';
export const PROGRESS_TEMPLATE =
  'download:TTSave:{"downloadedBytes":%(progress.downloaded_bytes)j,"totalBytes":%(progress.total_bytes)j,"speedBytesPerSecond":%(progress.speed)j}';
const unknownNumber = z
  .union([z.number().nonnegative(), z.literal('NA'), z.literal('N/A'), z.null()])
  .optional();
const structuredProgress = z.object({
  downloadedBytes: unknownNumber,
  totalBytes: unknownNumber,
  speedBytesPerSecond: unknownNumber,
});

export function parseDownloadProgress(
  line: string,
  maximumBytes: number,
): ApiJob['progress'] | null {
  if (!line.startsWith(PROGRESS_PREFIX)) return null;
  let data: unknown;
  try {
    data = JSON.parse(line.slice(PROGRESS_PREFIX.length)) as unknown;
  } catch {
    return null;
  }
  const parsed = structuredProgress.safeParse(data);
  if (!parsed.success) return null;
  const { downloadedBytes, totalBytes, speedBytesPerSecond } = parsed.data;
  const downloaded =
    typeof downloadedBytes === 'number' && Number.isSafeInteger(downloadedBytes)
      ? downloadedBytes
      : undefined;
  const total =
    typeof totalBytes === 'number' && Number.isSafeInteger(totalBytes) && totalBytes > 0
      ? totalBytes
      : undefined;
  if ((downloaded ?? 0) > maximumBytes || (total ?? 0) > maximumBytes)
    throw new HttpError(
      413,
      'VIDEO_TOO_LARGE',
      'This video exceeds the download size limit.',
    );
  const percent =
    downloaded !== undefined && total !== undefined
      ? (downloaded / total) * 100
      : undefined;
  return {
    ...(downloaded === undefined ? {} : { downloadedBytes: downloaded }),
    ...(percent !== undefined && percent <= 100 ? { percent } : {}),
    ...(total === undefined ? {} : { sizeBytes: total }),
    ...(typeof speedBytesPerSecond === 'number' ? { speedBytesPerSecond } : {}),
  };
}
