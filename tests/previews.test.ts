import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseEnvironment } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { fetchThumbnail, PreviewStore, publicIPv4 } from '../src/services/previews.js';
import { thumbnailSchema } from '../src/shared/thumbnail.js';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
const remote = 'https://p16.tiktokcdn.com/image.jpeg?secret=never-public';
const context = () => ({
  signal: new AbortController().signal,
  requestId: 'preview-test',
  logger: createLogger({ level: 'silent' }),
});
let root: string;
let store: PreviewStore | undefined;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'tiksavemp4-preview-test-'));
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
});
afterEach(async () => {
  await store?.dispose();
  vi.restoreAllMocks();
  mocks.lookup.mockReset();
  mocks.request.mockReset();
  if (
    path.dirname(root) !== path.resolve(tmpdir()) ||
    !path.basename(root).startsWith('tiksavemp4-preview-test-')
  )
    throw new Error('Unsafe test cleanup');
  await rm(root, { recursive: true, force: true });
});
function respond(type: string, body: Buffer, status = 200, location?: string) {
  mocks.request.mockImplementationOnce(
    (_url: unknown, _options: unknown, callback: (value: unknown) => void) => {
      const response = Object.assign(new PassThrough(), {
        statusCode: status,
        headers: { 'content-type': type, ...(location ? { location } : {}) },
      });
      return Object.assign(new EventEmitter(), {
        end: () =>
          queueMicrotask(() => {
            callback(response);
            response.end(body);
          }),
      });
    },
  );
}
it.each([
  '127.0.0.1',
  '10.1.2.3',
  '192.168.0.1',
  '172.16.0.2',
  '169.254.1.2',
  '100.64.0.1',
  '0.0.0.0',
  '224.1.1.1',
  '203.0.113.1',
  '::1',
])('rejects nonpublic destination %s', (address) =>
  expect(publicIPv4(address)).toBe(false),
);
it('rejects unapproved hosts and DNS rebinding to a private address before HTTP', async () => {
  await expect(
    fetchThumbnail('https://evil.test/image', context().signal, 1024),
  ).rejects.toThrow();
  mocks.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
  await expect(fetchThumbnail(remote, context().signal, 1024)).rejects.toThrow(
    'Unsafe preview',
  );
  expect(mocks.request).not.toHaveBeenCalled();
});
it('pins the resolved public address and rejects redirects to arbitrary destinations', async () => {
  respond('image/jpeg', Buffer.from('image'));
  await expect(fetchThumbnail(remote, context().signal, 1024)).resolves.toEqual(
    Buffer.from('image'),
  );
  const options = mocks.request.mock.calls[0]?.[1] as {
    lookup: (
      host: string,
      options: object,
      callback: (error: unknown, address: string, family: number) => void,
    ) => void;
  };
  const callback = vi.fn();
  options.lookup('ignored-host', {}, callback);
  expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
  respond('image/jpeg', Buffer.alloc(0), 302, 'https://localhost/private');
  await expect(fetchThumbnail(remote, context().signal, 1024)).rejects.toThrow();
  expect(mocks.request).toHaveBeenCalledTimes(2);
});
it('limits streamed bytes and rejects unsupported content types', async () => {
  respond('image/jpeg', Buffer.alloc(1025));
  await expect(fetchThumbnail(remote, context().signal, 1024)).rejects.toThrow(
    'size limit',
  );
  respond('text/html', Buffer.from('<script>bad</script>'));
  await expect(fetchThumbnail(remote, context().signal, 1024)).rejects.toThrow(
    'Unsupported',
  );
});
it('cancels a stalled DNS lookup without starting HTTP and bounds redirects', async () => {
  mocks.lookup.mockImplementationOnce(() => new Promise(() => undefined));
  const controller = new AbortController();
  const pending = fetchThumbnail(remote, controller.signal, 1024);
  controller.abort();
  await expect(pending).rejects.toThrow('Preview cancelled');
  expect(mocks.request).not.toHaveBeenCalled();
  for (let index = 0; index < 3; index++)
    respond('image/jpeg', Buffer.alloc(0), 302, '/another.jpeg');
  await expect(fetchThumbnail(remote, context().signal, 1024)).rejects.toThrow(
    'redirect',
  );
  expect(mocks.request).toHaveBeenCalledTimes(3);
});
it('stores a decoded WebP behind a random capability, expires it and cleans temporary data', async () => {
  const image = await sharp({
    create: { width: 90, height: 160, channels: 3, background: '#0088cc' },
  })
    .png()
    .toBuffer();
  store = new PreviewStore(parseEnvironment({ DOWNLOAD_TEMP_ROOT: root }), () =>
    Promise.resolve(image),
  );
  const id = randomUUID();
  const expiry = Date.now() + 10000;
  const local = await store.create(id, remote, context(), expiry);
  expect(thumbnailSchema.safeParse(local).success).toBe(true);
  expect(local).not.toContain('secret');
  const token =
    new URL(local ?? '', 'https://tiksavemp4.test').searchParams.get('token') ?? '';
  await expect(store.get(id, 'x'.repeat(43))).rejects.toMatchObject({ status: 403 });
  const bytes = await store.get(id, token);
  expect((await sharp(bytes).metadata()).format).toBe('webp');
  vi.spyOn(Date, 'now').mockReturnValue(expiry + 1);
  await expect(store.get(id, token)).rejects.toMatchObject({ status: 404 });
  await store.sweep();
  expect(await readdir(root)).toEqual([]);
});
it.each([
  'invalid image',
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
])('uses a local fallback for invalid or unsupported image bytes', async (image) => {
  store = new PreviewStore(parseEnvironment({ DOWNLOAD_TEMP_ROOT: root }), () =>
    Promise.resolve(Buffer.from(image)),
  );
  expect(
    await store.create(randomUUID(), remote, context(), Date.now() + 10000),
  ).toBeNull();
  expect(await readdir(root)).toEqual([]);
});
it('honors cancellation and enforces the preview deadline without storing a partial file', async () => {
  store = new PreviewStore(
    parseEnvironment({ DOWNLOAD_TEMP_ROOT: root, PREVIEW_TIMEOUT_MS: '1000' }),
    (_url, signal) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('cancelled')), {
          once: true,
        }),
      ),
  );
  const controller = new AbortController();
  const pending = store.create(
    randomUUID(),
    remote,
    { ...context(), signal: controller.signal },
    Date.now() + 10000,
  );
  controller.abort();
  expect(await pending).toBeNull();
  const timeout = store.create(randomUUID(), remote, context(), Date.now() + 10000);
  expect(await timeout).toBeNull();
  expect(await readdir(root)).toEqual([]);
});
