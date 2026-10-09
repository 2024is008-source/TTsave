import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  fetchPhotoImage,
  remoteImageSchema,
  IMAGE_MAX_BYTES,
} from '../src/services/photo-images.js';
import { publicFetch } from '../src/services/public-fetch.js';
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
const remote = 'https://p16.tiktokcdn.com/source.jpg?signature=never-public';
const signal = () => new AbortController().signal;
let closed = false;
beforeEach(() => {
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  closed = false;
});
afterEach(() => {
  vi.restoreAllMocks();
  mocks.lookup.mockReset();
  mocks.request.mockReset();
});
function respond(
  type: string,
  body: Buffer,
  status = 200,
  location?: string,
  length?: string,
) {
  mocks.request.mockImplementationOnce(
    (
      _url: unknown,
      options: { signal: AbortSignal },
      callback: (value: unknown) => void,
    ) => {
      const response = Object.assign(new PassThrough(), {
        statusCode: status,
        headers: {
          'content-type': type,
          ...(location ? { location } : {}),
          ...(length ? { 'content-length': length } : {}),
        },
      });
      response.once('close', () => {
        closed = true;
      });
      const req = Object.assign(new EventEmitter(), {
        destroy(error: Error) {
          response.destroy();
          req.emit('error', error);
          req.emit('close');
          return req;
        },
        end: () =>
          queueMicrotask(() => {
            callback(response);
            response.end(body);
            response.once('close', () => req.emit('close'));
          }),
      });
      options.signal.addEventListener('abort', () => req.destroy(new Error('aborted')), {
        once: true,
      });
      return req;
    },
  );
}
it.each(['jpeg', 'png', 'webp'] as const)(
  'preserves verified %s bytes, MIME and extension with pinned DNS',
  async (type) => {
    const bytes = await sharp({
      create: { width: 8, height: 12, channels: 3, background: '#ff3300' },
    })
      .toFormat(type)
      .toBuffer();
    respond(`image/${type}`, bytes);
    const image = await fetchPhotoImage(remote, signal());
    expect(image.bytes).toEqual(bytes);
    expect(image.extension).toBe(type === 'jpeg' ? 'jpg' : type);
    expect(image.contentType).toBe(`image/${type}`);
    const options = mocks.request.mock.calls[0]?.[1] as {
      lookup: (
        host: string,
        opts: object,
        cb: (error: unknown, address: string, family: number) => void,
      ) => void;
      headers: object;
      agent: boolean;
    };
    const callback = vi.fn();
    options.lookup('rebound', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
    expect(options.agent).toBe(false);
    expect(JSON.stringify(options.headers)).not.toMatch(/Cookie|Authorization|signature/);
  },
);
it.each([
  '127.0.0.1',
  '10.1.2.3',
  '169.254.169.254',
  '168.63.129.16',
  '192.168.1.1',
  '224.0.0.1',
  '203.0.113.1',
  '::1',
  'fc00::1',
  'fe80::1',
  'ff02::1',
  '::ffff:127.0.0.1',
])('blocks unsafe DNS %s before HTTP', async (address) => {
  mocks.lookup.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }]);
  await expect(fetchPhotoImage(remote, signal())).rejects.toThrow();
  expect(mocks.request).not.toHaveBeenCalled();
});
it('rejects any private address in a mixed answer and revalidates DNS at redirects', async () => {
  mocks.lookup
    .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
    .mockResolvedValueOnce([
      { address: '8.8.8.8', family: 4 },
      { address: '::1', family: 6 },
    ]);
  respond('image/jpeg', Buffer.alloc(0), 302, 'https://p19.tiktokcdn.com/other');
  await expect(fetchPhotoImage(remote, signal())).rejects.toThrow();
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it.each([
  'https://evil.example/image',
  'http://p16.tiktokcdn.com/a',
  'https://p16.tiktokcdn.com.attacker.example/a',
  'https://user@p16.tiktokcdn.com/a',
  'https://p16.tiktokcdn.com:443/a',
  'https://p16.tiktokcdn.com\\@evil.example/a',
  'https://%70.tiktokcdn.com/a',
])('rejects unsafe input and redirects %s', async (url) => {
  expect(remoteImageSchema.safeParse(url).success).toBe(false);
  respond('image/jpeg', Buffer.alloc(0), 302, url);
  await expect(fetchPhotoImage(remote, signal())).rejects.toThrow();
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it('rejects redirect loops and excessive redirects', async () => {
  respond('', Buffer.alloc(0), 302, remote);
  await expect(fetchPhotoImage(remote, signal())).rejects.toThrow();
  for (let i = 1; i <= 3; i++)
    respond('', Buffer.alloc(0), 302, `https://p16.tiktokcdn.com/${String(i)}`);
  await expect(fetchPhotoImage(remote, signal())).rejects.toThrow();
  expect(mocks.request).toHaveBeenCalledTimes(4);
});
it.each([
  'text/html',
  'application/json',
  'image/svg+xml',
  'application/octet-stream',
  'image/jpeg',
  'image/png',
  'image/webp',
])('rejects invalid MIME or signature %s', async (type) => {
  respond(type, Buffer.from('<html>not image bytes</html>'));
  await expect(fetchPhotoImage(remote, signal())).rejects.toThrow();
});
it('bounds streamed bytes and declared lengths and closes failed streams', async () => {
  respond('image/jpeg', Buffer.alloc(1025));
  await expect(
    publicFetch(remote, remoteImageSchema, signal(), 1024, 'image/jpeg'),
  ).rejects.toThrow();
  expect(closed).toBe(true);
  respond('image/jpeg', Buffer.alloc(0), 200, undefined, String(IMAGE_MAX_BYTES + 1));
  await expect(fetchPhotoImage(remote, signal())).rejects.toThrow();
});
it('cancels DNS and upstream HTTP without leaking errors', async () => {
  mocks.lookup.mockImplementationOnce(() => new Promise(() => undefined));
  const dns = new AbortController();
  const pending = fetchPhotoImage(remote, dns.signal);
  dns.abort();
  await expect(pending).rejects.toThrow('cancelled');
  mocks.request.mockImplementationOnce(
    (_url: unknown, options: { signal: AbortSignal }) => {
      const req = Object.assign(new EventEmitter(), {
        end: () => undefined,
        destroy: () => {
          closed = true;
          req.emit('error', new Error(remote));
          req.emit('close');
          return req;
        },
      });
      options.signal.addEventListener('abort', () => req.destroy(), { once: true });
      return req;
    },
  );
  const http = new AbortController();
  const fetching = fetchPhotoImage(remote, http.signal);
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalled());
  http.abort();
  await expect(fetching).rejects.toThrow('cancelled');
  expect(closed).toBe(true);
});
it('enforces a total budget during DNS lookup', async () => {
  mocks.lookup.mockImplementationOnce(() => new Promise(() => undefined));
  await expect(
    publicFetch(remote, remoteImageSchema, signal(), 1024, 'image/jpeg', 20),
  ).rejects.toMatchObject({ code: 'SOURCE_TIMEOUT' });
  expect(mocks.request).not.toHaveBeenCalled();
});
it('destroys an unconnected request within the connection deadline', async () => {
  vi.useFakeTimers();
  const destroy = vi.fn();
  mocks.request.mockImplementationOnce(() => {
    const req = Object.assign(new EventEmitter(), {
      end: () => undefined,
      destroy(error: Error) {
        destroy();
        req.emit('error', error);
        req.emit('close');
        return req;
      },
    });
    return req;
  });
  try {
    const pending = publicFetch(remote, remoteImageSchema, signal(), 1024, 'image/jpeg');
    const rejected = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(2001);
    await rejected;
    expect(destroy).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
