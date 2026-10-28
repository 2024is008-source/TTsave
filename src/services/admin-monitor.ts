import { lstat, opendir, statfs } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env, type Environment } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { DownloaderService } from './memory-store.js';
import { checkTools } from './tool-check.js';

async function storage(root: string) {
  const temporary = {
    available: false,
    bytes: 0,
    files: 0,
    directories: 0,
    partial: false,
  };
  let disk: { availableBytes: number; totalBytes: number } | null = null;
  try {
    const volume = await statfs(root).catch(() => statfs(path.dirname(root)));
    disk = {
      availableBytes: volume.bavail * volume.bsize,
      totalBytes: volume.blocks * volume.bsize,
    };
  } catch {
    /* Display unavailable instead of inventing free disk space. */
  }
  const deadline = Date.now() + 1000;
  try {
    const roots = await opendir(root);
    temporary.available = true;
    for await (const directory of roots) {
      if (Date.now() > deadline || temporary.directories >= 200) {
        temporary.partial = true;
        break;
      }
      if (!directory.isDirectory() || !/^(?:job|preview)-/.test(directory.name)) continue;
      temporary.directories++;
      const directoryPath = path.join(root, directory.name);
      for await (const entry of await opendir(directoryPath)) {
        if (Date.now() > deadline || temporary.files >= 2000) {
          temporary.partial = true;
          break;
        }
        if (!entry.isFile() || entry.isSymbolicLink()) continue;
        const info = await lstat(path.join(directoryPath, entry.name)).catch(() => null);
        if (info?.isFile() && !info.isSymbolicLink()) {
          temporary.bytes += info.size;
          temporary.files++;
        }
      }
    }
  } catch {
    temporary.partial = temporary.available;
  }
  return { disk, temporary };
}

export function createAdminMonitor(
  service: DownloaderService,
  ready: () => boolean,
  config: Environment = env,
) {
  let cached: { expires: number; value: Awaited<ReturnType<typeof inspect>> } | undefined;
  let pending: Promise<Awaited<ReturnType<typeof inspect>>> | undefined;
  async function inspect() {
    const [tools, space] = await Promise.all([
      checkTools(
        { signal: AbortSignal.timeout(15000), requestId: randomUUID(), logger },
        config,
      ),
      storage(config.DOWNLOAD_TEMP_ROOT),
    ]);
    return { checkedAt: new Date().toISOString(), tools, ...space };
  }
  return async () => {
    if (!cached || cached.expires <= Date.now()) {
      pending ??= inspect()
        .then((value) => {
          cached = { value, expires: Date.now() + 30000 };
          return value;
        })
        .finally(() => {
          pending = undefined;
        });
      await pending;
    }
    return {
      ...cached?.value,
      applicationReady: ready(),
      uptimeSeconds: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      queue: service.metrics?.() ?? null,
    };
  };
}

export type AdminMonitor = ReturnType<typeof createAdminMonitor>;
