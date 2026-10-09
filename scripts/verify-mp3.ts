import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseEnvironment } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { runTool } from '../src/services/tool-process.js';
import { convertMp3, verifyMp3 } from '../src/services/mp3.js';

// Offline smoke verification: synthetic tone only, never contacts TikTok.
const directory = await mkdtemp(path.join(tmpdir(), 'tiksavemp4-audio-smoke-'));
if (
  path.dirname(directory) !== path.resolve(tmpdir()) ||
  !path.basename(directory).startsWith('tiksavemp4-audio-smoke-')
)
  throw new Error('Unsafe smoke cleanup');
const config = parseEnvironment();
const context = {
  signal: new AbortController().signal,
  requestId: 'offline-audio-smoke',
  logger: createLogger({ level: 'silent' }),
};
const limits = {
  timeoutMs: 15000,
  maxOutputBytes: 65536,
  operation: 'download' as const,
  waitForClose: true,
};
try {
  const source = path.join(directory, 'source.mp4');
  const output = path.join(directory, 'audio.mp3');
  const generated = await runTool(
    config.FFMPEG_PATH,
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=64x64:r=10',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      '-t',
      '2',
      '-c:v',
      'mpeg4',
      '-c:a',
      'aac',
      '-shortest',
      source,
    ],
    limits,
    context,
  );
  if (generated.code !== 0) throw new Error('Synthetic source generation failed');
  await convertMp3(source, output, config, context);
  await verifyMp3(output, config, context);
  const decode = await runTool(
    config.FFMPEG_PATH,
    ['-nostdin', '-v', 'error', '-i', output, '-f', 'null', '-'],
    limits,
    context,
  );
  if (decode.code !== 0) throw new Error('MP3 decode failed');
  const size = (await readFile(output)).byteLength;
  if (!size) throw new Error('Empty MP3');
  await writeFile(
    'docs/MP3_SMOKE_RESULT.json',
    JSON.stringify(
      {
        source: 'Offline synthetic 440Hz tone in MP4',
        encoder: 'libmp3lame',
        setting: 'VBR q:a 2',
        verifiedCodec: 'mp3',
        fullDecodePassed: true,
        outputBytes: size,
      },
      null,
      2,
    ) + '\n',
  );
  process.stdout.write(
    `Playable MP3 verified: ${String(size)} bytes; full FFmpeg decode passed.\n`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
