import { expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAdminMonitor } from '../src/services/admin-monitor.js';
import { parseEnvironment } from '../src/config/env.js';
import { MockDownloaderService } from './fixtures/mock-downloader.js';
const tools = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      ytDlp: true,
      ffmpeg: false,
      ffprobe: true,
      chrome: true,
      mp3: false,
    }),
  ),
);
vi.mock('../src/services/tool-check.js', () => ({ checkTools: tools }));
async function removeFixture(root: string) {
  if (
    path.dirname(root) !== path.resolve(tmpdir()) ||
    !path.basename(root).startsWith('ttsave-monitor-test-')
  )
    throw Error('Unsafe cleanup');
  await rm(root, { recursive: true, force: true });
}
it('measures only managed temporary files and shares cached tool/storage checks', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ttsave-monitor-test-'));
  try {
    await mkdir(path.join(root, 'job-fixture'));
    await writeFile(path.join(root, 'job-fixture', 'video.mp4'), '12345');
    await writeFile(path.join(root, 'unrelated-private-file'), 'must-not-be-counted');
    tools.mockClear();
    const monitor = createAdminMonitor(
      new MockDownloaderService(),
      () => true,
      parseEnvironment({ DOWNLOAD_TEMP_ROOT: root }),
    );
    const [first, second] = await Promise.all([monitor(), monitor()]);
    expect(tools).toHaveBeenCalledTimes(1);
    expect(first.checkedAt).toBe(second.checkedAt);
    expect(first.temporary).toMatchObject({
      available: true,
      bytes: 5,
      files: 1,
      directories: 1,
      partial: false,
    });
    expect(first.tools).toMatchObject({ ffmpeg: false, mp3: false });
    expect(first.applicationReady).toBe(true);
    expect(first.memory.rss).toBeGreaterThan(0);
    expect(JSON.stringify(first)).not.toContain(root);
    await monitor();
    expect(tools).toHaveBeenCalledTimes(1);
  } finally {
    await removeFixture(root);
  }
});
it('reports an unavailable temporary root honestly without creating it', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ttsave-monitor-test-'));
  try {
    const result = await createAdminMonitor(
      new MockDownloaderService(),
      () => false,
      parseEnvironment({ DOWNLOAD_TEMP_ROOT: path.join(root, 'missing') }),
    )();
    expect(result.applicationReady).toBe(false);
    expect(result.temporary?.available).toBe(false);
    expect(result.queue).toBeNull();
  } finally {
    await removeFixture(root);
  }
});
