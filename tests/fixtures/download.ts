import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { vi } from 'vitest';
import type { AnalyzedSource } from '../../src/services/yt-dlp.js';

export const mp4Fixture = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from('ftypisom'),
  Buffer.alloc(20),
]);
export const publicUrl = 'https://www.tiktok.com/@test/video/123';
export function sourceFixture(): AnalyzedSource {
  return {
    media: {
      id: randomUUID(),
      title: 'Test source',
      creator: 'Test creator',
      thumbnail: null,
      durationSeconds: 30,
      sourceUrl: publicUrl,
      formats: [
        {
          id: 'source-1',
          container: 'mp4',
          qualityLabel: '720 × 1280 source pixels',
          width: 720,
          height: 1280,
          hasAudio: true,
        },
      ],
      mock: false,
      downloadAvailable: false,
    },
    selectors: new Map([['source-1', 'download-0']]),
  };
}
export function downloadChild(args: string[]) {
  const directory = args[args.indexOf('--paths') + 1];
  if (!args.includes('--paths') || !directory)
    throw new Error('Missing server directory');
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    directory,
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit('close', null));
      return true;
    }),
    complete: async (data = mp4Fixture) => {
      await writeFile(path.join(directory, 'video.mp4'), data);
      child.emit('close', 0);
    },
  });
  return child;
}
