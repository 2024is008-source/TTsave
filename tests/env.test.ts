import { describe, expect, it } from 'vitest';

import { parseEnvironment } from '../src/config/env.js';

describe('environment configuration', () => {
  it('provides safe defaults', () => {
    expect(parseEnvironment({})).toMatchObject({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      TRUST_PROXY: false,
    });
  });

  it('rejects an invalid port', () => {
    expect(() => parseEnvironment({ PORT: '70000' })).toThrow(
      'Invalid environment configuration',
    );
  });
  it('accepts approved executable names or local absolute paths and bounded limits', () => {
    expect(
      parseEnvironment({
        YTDLP_PATH: process.execPath,
        FFMPEG_PATH: 'ffmpeg.exe',
        ANALYSIS_TIMEOUT_MS: '1000',
      }),
    ).toMatchObject({
      YTDLP_PATH: process.execPath,
      FFMPEG_PATH: 'ffmpeg.exe',
      ANALYSIS_TIMEOUT_MS: 1000,
    });
  });
  it.each([
    { YTDLP_PATH: 'yt-dlp --cookies secret' },
    { YTDLP_PATH: './tools/yt-dlp' },
    { YTDLP_PATH: '--version' },
    { FFMPEG_PATH: 'cmd.exe' },
    { YTDLP_PATH: process.execPath.replace(/[^/\\]+$/, 'runner.cmd') },
    { ANALYSIS_TIMEOUT_MS: '0' },
    { ANALYSIS_MAX_OUTPUT_BYTES: '999999999' },
    { ANALYSIS_MAX_CONCURRENT: '100' },
  ])('rejects unsafe tool configuration: %j', (values) => {
    expect(() => parseEnvironment(values)).toThrow('Invalid environment configuration');
  });
});
