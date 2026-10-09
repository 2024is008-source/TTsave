import sharp from 'sharp';
import { z } from 'zod';
import { thumbnailHosts } from '../shared/thumbnail.js';
import { HttpError } from '../middleware/error-handler.js';
import { publicFetch } from './public-fetch.js';

export const IMAGE_MAX_BYTES = 12 * 1024 * 1024;
export const remoteImageSchema = z
  .string()
  .max(4096)
  .refine((value) => {
    if (/[\s\\\p{Cc}]/u.test(value)) return false;
    const authority = /^https:\/\/([^/?#]+)/i.exec(value)?.[1];
    if (!authority || !/^[a-z\d.-]+$/i.test(authority) || authority.endsWith('.'))
      return false;
    try {
      const url = new URL(value);
      return (
        url.hostname === authority.toLowerCase() &&
        thumbnailHosts.some(
          (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
        ) &&
        authority
          .split('.')
          .every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))
      );
    } catch {
      return false;
    }
  }, 'Unsupported image source.');

export async function fetchPhotoImage(url: string, signal: AbortSignal) {
  const { bytes, contentType } = await publicFetch(
    url,
    remoteImageSchema,
    signal,
    IMAGE_MAX_BYTES,
    'image/jpeg,image/png,image/webp',
  );
  const invalid = () =>
    new HttpError(
      502,
      'IMAGE_UNAVAILABLE',
      'The image could not be downloaded. Please select another image or try again.',
    );
  const extension: 'jpg' | 'png' | 'webp' | null =
    contentType === 'image/jpeg'
      ? 'jpg'
      : contentType === 'image/png'
        ? 'png'
        : contentType === 'image/webp'
          ? 'webp'
          : null;
  if (!extension || bytes.length < 12) throw invalid();
  const signature =
    extension === 'jpg'
      ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : extension === 'png'
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.toString('ascii', 0, 4) === 'RIFF' &&
          bytes.toString('ascii', 8, 12) === 'WEBP' &&
          bytes.readUInt32LE(4) + 8 === bytes.length;
  if (!signature) throw invalid();
  try {
    const metadata = await sharp(bytes, {
      limitInputPixels: 40_000_000,
      failOn: 'warning',
    }).metadata();
    if (
      metadata.format !== (extension === 'jpg' ? 'jpeg' : extension) ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) !== 1
    )
      throw invalid();
    await sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' }).stats();
    signal.throwIfAborted();
    return {
      bytes,
      contentType,
      extension,
      width: metadata.width,
      height: metadata.height,
    };
  } catch {
    throw invalid();
  }
}
