import { describe, expect, it } from 'vitest';

import { parseEnvironment } from '../src/config/env.js';

describe('environment configuration', () => {
  it('requires explicit canonical HTTPS configuration in production', () => {
    expect(() => parseEnvironment({ NODE_ENV: 'production' })).toThrow(
      'Invalid environment configuration',
    );
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'production',
        PUBLIC_BASE_URL: 'http://localhost:3000',
      }),
    ).toThrow('Invalid environment configuration');
    expect(
      parseEnvironment({
        NODE_ENV: 'production',
        PUBLIC_BASE_URL: 'https://tiksavemp4.online/',
      }).PUBLIC_BASE_URL,
    ).toBe('https://tiksavemp4.online');
  });
  it('accepts only validated legal contact addresses', () => {
    expect(() => parseEnvironment({ LEGAL_CONTACT_EMAIL: 'not an email' })).toThrow();
    expect(
      parseEnvironment({ LEGAL_CONTACT_EMAIL: 'owner@example.test' }).LEGAL_CONTACT_EMAIL,
    ).toBe('owner@example.test');
  });
  it('normalizes the sole canonical production origin', () => {
    expect(parseEnvironment({}).PUBLIC_BASE_URL).toBe('https://tiksavemp4.online');
    expect(
      parseEnvironment({ PUBLIC_BASE_URL: 'https://tiksavemp4.online/' }).PUBLIC_BASE_URL,
    ).toBe('https://tiksavemp4.online');
  });
  it.each([
    'http://tiksavemp4.online',
    'https://www.tiksavemp4.online',
    'https://tiksavemp4.online.evil.test',
    'https://localhost',
    'https://user:pass@tiksavemp4.online',
    'https://tiksavemp4.online/path',
    'https://tiksavemp4.online/?x=1',
    'https://tiksavemp4.online/#section',
    'https://tiksavemp4.online:8443',
    'https://tiksavemp4.online:443',
    'not a URL',
  ])('rejects an unsafe or alternate public origin: %s', (url) => {
    expect(() => parseEnvironment({ PUBLIC_BASE_URL: url })).toThrow(
      'Invalid environment configuration',
    );
  });
  it('rejects malformed public contact details', () => {
    expect(() => parseEnvironment({ PUBLIC_CONTACT_EMAIL: 'not an email' })).toThrow();
  });
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
