import { beforeEach, expect, it, vi } from 'vitest';
import { verifyAudioSource, verifyVideo } from '../src/services/verify-video.js';
import { parseEnvironment } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
const tool = vi.hoisted(() => vi.fn());
vi.mock('../src/services/tool-process.js', () => ({ runTool: tool }));
const config = parseEnvironment();
const context = {
  signal: new AbortController().signal,
  requestId: 'fixture',
  logger: createLogger({ level: 'silent' }),
};
const actual = {
  streams: [{ codec_type: 'video', width: 540, height: 960 }, { codec_type: 'audio' }],
  format: { duration: '27.466667', format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
};
const selected = {
  id: 'source-1',
  container: 'mp4' as const,
  hasAudio: true,
  qualityLabel: '576p',
  width: 576,
  height: 1024,
};
beforeEach(() => {
  tool.mockReset();
  tool.mockResolvedValue({ code: 0, stdout: JSON.stringify(actual), stderr: '' });
});
it('accepts the real MP3-source dimension mismatch while refusing to downgrade a selected MP4', async () => {
  await expect(
    verifyVideo('fixture.mp4', selected, config, context),
  ).rejects.toMatchObject({ code: 'VIDEO_VERIFICATION_FAILED' });
  await expect(verifyAudioSource('fixture.mp4', config, context)).resolves.toMatchObject({
    width: 540,
    height: 960,
  });
});
it.each([
  { ...actual, streams: [{ codec_type: 'video', width: 540, height: 960 }] },
  { ...actual, streams: [{ codec_type: 'audio' }] },
  { ...actual, format: { duration: '27', format_name: 'matroska,webm' } },
  { ...actual, format: { duration: '601', format_name: 'mp4' } },
  { ...actual, format: { duration: '0', format_name: 'mp4' } },
])('still refuses invalid input for MP3 extraction: %j', async (payload) => {
  tool.mockResolvedValue({ code: 0, stdout: JSON.stringify(payload), stderr: '' });
  await expect(verifyAudioSource('fixture.mp4', config, context)).rejects.toMatchObject({
    code: 'VIDEO_VERIFICATION_FAILED',
  });
});
