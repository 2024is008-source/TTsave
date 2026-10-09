import { open } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { HttpError } from '../middleware/error-handler.js';
import { fetchPhotoImage } from './photo-images.js';
import { downloadFilename } from './filename.js';

export const PHOTO_COMBINED_MAX_BYTES = 64 * 1024 * 1024;
export const PHOTO_PROCESSING_TIMEOUT_MS = 60_000;
export const PHOTO_ARCHIVE_MAX_CONCURRENT = 1;
const table = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});
async function checksum(bytes: Buffer, signal: AbortSignal) {
  let crc = 0xffffffff;
  for (let offset = 0; offset < bytes.length; offset += 65536) {
    signal.throwIfAborted();
    const end = Math.min(offset + 65536, bytes.length);
    for (let index = offset; index < end; index++)
      crc = (crc >>> 8) ^ (table[(crc ^ (bytes[index] ?? 0)) & 255] ?? 0);
    await setImmediate(undefined, { signal });
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP STORE: verified compressed image bytes, one fetch at a time, bounded directory. */
export async function writePhotoArchive(
  destination: string,
  photos: { url: string; position: number }[],
  media: { title: string; creator: string | null },
  signal: AbortSignal,
  maxBytes = PHOTO_COMBINED_MAX_BYTES,
) {
  if (photos.length < 2 || photos.length > 35) throw new Error('Invalid archive count');
  const output = await open(destination, 'wx', 0o600);
  let offset = 0;
  let combined = 0;
  const directory: Buffer[] = [];
  const write = async (bytes: Buffer) => {
    for (let written = 0; written < bytes.length;) {
      signal.throwIfAborted();
      const result = await output.write(bytes, written, bytes.length - written, offset);
      if (!result.bytesWritten) throw new Error('Incomplete archive write');
      written += result.bytesWritten;
      offset += result.bytesWritten;
    }
  };
  try {
    for (const photo of photos) {
      signal.throwIfAborted();
      const image = await fetchPhotoImage(photo.url, signal);
      combined += image.bytes.length;
      if (combined > Math.min(maxBytes, PHOTO_COMBINED_MAX_BYTES))
        throw new HttpError(
          413,
          'IMAGES_TOO_LARGE',
          'The selected images are too large to process.',
        );
      const name = Buffer.from(
        downloadFilename(media.title, media.creator, image.extension, photo.position),
      );
      const projectedSize =
        offset +
        30 +
        name.length +
        image.bytes.length +
        directory.reduce((size, part) => size + part.length, 0) +
        46 +
        name.length +
        22;
      if (projectedSize > maxBytes)
        throw new HttpError(
          413,
          'IMAGES_TOO_LARGE',
          'The selected images are too large to process.',
        );
      const crc = await checksum(image.bytes, signal);
      const entryOffset = offset;
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0x800, 6); // UTF-8; stored, no encryption or descriptors.
      header.writeUInt16LE(33, 12); // January 1, 1980; deterministic DOS date.
      header.writeUInt32LE(crc, 14);
      header.writeUInt32LE(image.bytes.length, 18);
      header.writeUInt32LE(image.bytes.length, 22);
      header.writeUInt16LE(name.length, 26);
      await write(header);
      await write(name);
      await write(image.bytes);
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(0x800, 8);
      central.writeUInt16LE(33, 14);
      central.writeUInt32LE(crc, 16);
      central.writeUInt32LE(image.bytes.length, 20);
      central.writeUInt32LE(image.bytes.length, 24);
      central.writeUInt16LE(name.length, 28);
      central.writeUInt32LE(entryOffset, 42);
      directory.push(central, name);
    }
    const directoryOffset = offset;
    for (const chunk of directory) await write(chunk);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(photos.length, 8);
    end.writeUInt16LE(photos.length, 10);
    end.writeUInt32LE(offset - directoryOffset, 12);
    end.writeUInt32LE(directoryOffset, 16);
    await write(end);
    signal.throwIfAborted();
    return offset;
  } finally {
    await output.close();
  }
}
