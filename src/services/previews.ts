import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  realpath,
  readFile,
  writeFile,
  readdir,
  lstat,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import type { Environment } from '../config/env.js';
import type { AnalysisContext } from './tool-process.js';
import { remoteThumbnailSchema } from '../shared/thumbnail.js';
import { HttpError } from '../middleware/error-handler.js';

export function publicIPv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false;
  const [a = 0, b = 0, c = 0] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

/** No generic proxy: caller supplies only the server-private extractor thumbnail. */
export async function fetchThumbnail(
  input: string,
  signal: AbortSignal,
  maximum: number,
  redirects = 0,
): Promise<Buffer> {
  const url = new URL(remoteThumbnailSchema.parse(input));
  signal.throwIfAborted();
  let stopLookup: (() => void) | undefined;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, family: 4 }),
    new Promise<never>((_resolve, reject) => {
      stopLookup = () => reject(new Error('Preview cancelled'));
      signal.addEventListener('abort', stopLookup, { once: true });
      if (signal.aborted) stopLookup();
    }),
  ]).finally(() => {
    if (stopLookup) signal.removeEventListener('abort', stopLookup);
  });
  signal.throwIfAborted();
  if (!addresses.length || addresses.some((entry) => !publicIPv4(entry.address)))
    throw new Error('Unsafe preview destination');
  const address = addresses[0]?.address;
  if (!address) throw new Error('Preview destination unavailable');
  const response = await new Promise<import('node:http').IncomingMessage>(
    (resolve, reject) => {
      const req = request(
        url,
        {
          method: 'GET',
          signal,
          family: 4,
          lookup: (_host, _options, callback) => callback(null, address, 4),
          headers: {
            Accept: 'image/jpeg,image/png,image/webp',
            'Accept-Encoding': 'identity',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
            Referer: 'https://www.tiktok.com/',
          },
        },
        resolve,
      );
      req.once('error', reject);
      req.end();
    },
  );
  if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
    const location = response.headers.location;
    response.destroy();
    if (!location || redirects >= 2) throw new Error('Unsupported preview redirect');
    return fetchThumbnail(new URL(location, url).href, signal, maximum, redirects + 1);
  }
  const type = response.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
  if (
    response.statusCode !== 200 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(type ?? '') ||
    Number(response.headers['content-length'] ?? 0) > maximum
  ) {
    response.destroy();
    throw new Error('Unsupported preview response');
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of response) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    bytes += data.length;
    if (bytes > maximum) {
      response.destroy();
      throw new Error('Preview size limit');
    }
    chunks.push(data);
  }
  signal.throwIfAborted();
  return Buffer.concat(chunks);
}

type Entry = { directory: string; token: string; expires: number };
export class PreviewStore {
  private entries = new Map<string, Entry>();
  private active = new Set<Promise<string | null>>();
  private controllers = new Set<AbortController>();
  private stopping = false;
  constructor(
    private readonly config: Environment,
    private readonly fetchImage = fetchThumbnail,
  ) {}
  private async root() {
    await mkdir(this.config.DOWNLOAD_TEMP_ROOT, { recursive: true, mode: 0o700 });
    return realpath(this.config.DOWNLOAD_TEMP_ROOT);
  }
  private async remove(directory: string) {
    const root = await this.root();
    const resolved = await realpath(directory).catch(() => null);
    if (!resolved) return;
    const relative = path.relative(root, resolved);
    if (
      !relative.startsWith('preview-') ||
      relative.includes(path.sep) ||
      relative.startsWith('..') ||
      path.isAbsolute(relative)
    )
      throw new Error('Unsafe preview cleanup');
    await rm(directory, { recursive: true, force: true });
  }
  create(
    id: string,
    url: string | undefined,
    context: AnalysisContext,
    expires: number,
  ): Promise<string | null> {
    if (!url || this.stopping) return Promise.resolve(null);
    const work = this.capture(id, url, context, expires);
    this.active.add(work);
    void work.finally(() => this.active.delete(work));
    return work;
  }
  private async capture(
    id: string,
    url: string,
    context: AnalysisContext,
    expires: number,
  ) {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), this.config.PREVIEW_TIMEOUT_MS);
    timer.unref();
    const signal = AbortSignal.any([controller.signal, context.signal]);
    let directory: string | undefined;
    try {
      z.uuid().parse(id);
      const image = await this.fetchImage(
        remoteThumbnailSchema.parse(url),
        signal,
        this.config.PREVIEW_MAX_BYTES,
      );
      signal.throwIfAborted();
      if (image.length > this.config.PREVIEW_MAX_BYTES)
        throw new Error('Preview too large');
      const processor = sharp(image, {
        limitInputPixels: 16_000_000,
        animated: false,
      }).timeout({
        seconds: Math.max(1, Math.floor(this.config.PREVIEW_TIMEOUT_MS / 1000)),
      });
      const abort = () => {
        processor.destroy();
      };
      signal.addEventListener('abort', abort, { once: true });
      let encoded: Buffer;
      try {
        const metadata = await processor.metadata();
        if (
          !['jpeg', 'png', 'webp'].includes(metadata.format) ||
          (metadata.pages ?? 1) > 1
        )
          throw new Error('Unsupported preview image');
        encoded = await processor
          .rotate()
          .resize({ width: 1080, height: 1920, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
      } finally {
        signal.removeEventListener('abort', abort);
        processor.destroy();
      }
      signal.throwIfAborted();
      if (encoded.length > this.config.PREVIEW_MAX_BYTES)
        throw new Error('Encoded preview too large');
      directory = await mkdtemp(path.join(await this.root(), 'preview-'));
      await writeFile(path.join(directory, 'thumbnail.webp'), encoded, {
        flag: 'wx',
        mode: 0o600,
      });
      signal.throwIfAborted();
      const token = randomBytes(32).toString('base64url');
      this.entries.set(id, { directory, token, expires });
      directory = undefined;
      return `/api/v1/analysis/${id}/thumbnail?token=${token}`;
    } catch {
      context.logger.warn(
        {
          requestId: context.requestId,
          stage: 'preview',
          failureCategory: 'PREVIEW_UNAVAILABLE',
        },
        'Preview unavailable; using local fallback',
      );
      return null;
    } finally {
      clearTimeout(timer);
      this.controllers.delete(controller);
      if (directory)
        await this.remove(directory).catch(() =>
          context.logger.warn(
            {
              requestId: context.requestId,
              stage: 'preview',
              failureCategory: 'CLEANUP_FAILED',
            },
            'Preview cleanup will be retried',
          ),
        );
    }
  }
  async get(id: string, token: string): Promise<Buffer> {
    const entry = this.entries.get(id);
    if (!entry || entry.expires <= Date.now())
      throw new HttpError(
        404,
        'PREVIEW_UNAVAILABLE',
        'The video preview is no longer available.',
      );
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(token) ||
      !timingSafeEqual(Buffer.from(entry.token), Buffer.from(token))
    )
      throw new HttpError(
        403,
        'PREVIEW_ACCESS_DENIED',
        'This preview is not authorized.',
      );
    const filename = path.join(entry.directory, 'thumbnail.webp');
    const info = await lstat(filename);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size > this.config.PREVIEW_MAX_BYTES
    )
      throw new HttpError(
        404,
        'PREVIEW_UNAVAILABLE',
        'The video preview is unavailable.',
      );
    return readFile(filename);
  }
  async sweep() {
    for (const [id, entry] of this.entries)
      if (entry.expires <= Date.now()) {
        await this.remove(entry.directory);
        this.entries.delete(id);
      }
    const root = await this.root();
    const owned = new Set([...this.entries.values()].map((entry) => entry.directory));
    for (const name of await readdir(root)) {
      if (!name.startsWith('preview-')) continue;
      const directory = path.join(root, name);
      if (owned.has(directory)) continue;
      const info = await lstat(directory);
      if (
        info.isDirectory() &&
        !info.isSymbolicLink() &&
        Date.now() - info.mtimeMs >= this.config.JOB_TTL_MS
      )
        await this.remove(directory);
    }
  }
  async delete(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    await this.remove(entry.directory);
    this.entries.delete(id);
  }
  async dispose() {
    this.stopping = true;
    for (const controller of this.controllers) controller.abort();
    await Promise.allSettled([...this.active]);
    for (const entry of this.entries.values()) await this.remove(entry.directory);
    this.entries.clear();
  }
}
