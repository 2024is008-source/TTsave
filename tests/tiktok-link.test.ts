import { EventEmitter } from 'node:events';
import type { RequestOptions } from 'node:https';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publicAddress } from '../src/services/public-address.js';
import { resolveTikTokLink, SHORT_LINK_LIMITS } from '../src/services/tiktok-link.js';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
const full = 'https://www.tiktok.com/@creator/video/123';
const signal = () => new AbortController().signal;
beforeEach(() => {
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
});
afterEach(() => {
  mocks.lookup.mockReset();
  mocks.request.mockReset();
  vi.useRealTimers();
});

function reply(status: number, location?: string, stalled: boolean | 'response' = false) {
  const req = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
  mocks.request.mockImplementationOnce(
    (_url: URL, options: RequestOptions, callback: (response: unknown) => void) => {
      const abort = () => {
        req.destroy(new Error('Internal abort secret'));
      };
      options.signal?.addEventListener('abort', abort, { once: true });
      req.destroy.mockImplementation((error?: Error) => {
        if (error) req.emit('error', error);
        req.emit('close');
        return req;
      });
      req.once('close', () => options.signal?.removeEventListener('abort', abort));
      req.end.mockImplementation(() =>
        queueMicrotask(() => {
          if (stalled === true) return;
          const socket = new EventEmitter();
          req.emit('socket', socket);
          socket.emit('secureConnect');
          if (stalled === 'response') return;
          const response = Object.assign(new PassThrough(), {
            statusCode: status,
            headers: {
              ...(location ? { location } : {}),
              'set-cookie': ['secret=not-forwarded'],
            },
          });
          callback(response);
          req.emit('close');
        }),
      );
      return req;
    },
  );
  return req;
}

describe('secure TikTok short-link resolution', () => {
  it.each(['vm', 'vt'])(
    'resolves %s with a canonical video URL and no tracking data',
    async (host) => {
      reply(302, 'https://m.tiktok.com/t/Znext/?tracking=secret');
      reply(307, full + '/?share_token=secret#caption');
      reply(200);
      await expect(
        resolveTikTokLink(`https://${host}.tiktok.com/Zabc/`, signal()),
      ).resolves.toBe(full);
      expect(mocks.request).toHaveBeenCalledTimes(3);
      expect(mocks.lookup).toHaveBeenCalledWith('www.tiktok.com', {
        all: true,
        verbatim: true,
      });
      for (const [, options] of mocks.request.mock.calls as [URL, RequestOptions][]) {
        expect(options).toMatchObject({
          agent: false,
          method: 'GET',
          rejectUnauthorized: true,
          maxHeaderSize: 8192,
        });
        expect(options.headers).toEqual({
          Accept: 'text/html',
          'Accept-Encoding': 'identity',
          'User-Agent': 'TikSaveMp4/0.1 (+https://tiksavemp4.online)',
        });
      }
    },
  );
  it.each(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'])(
    'normalizes existing full URLs on %s without networking',
    async (host) => {
      await expect(
        resolveTikTokLink(
          `https://${host}/@creator/video/123/?tracking=secret#caption`,
          signal(),
        ),
      ).resolves.toBe(full);
      expect(mocks.lookup).not.toHaveBeenCalled();
      expect(mocks.request).not.toHaveBeenCalled();
    },
  );
  it('does not forward client-supplied short-link query or fragment data', async () => {
    reply(302, full);
    reply(200);
    await resolveTikTokLink(
      'https://vm.tiktok.com/Zabc/?share_token=private#caption',
      signal(),
    );
    expect((mocks.request.mock.calls[0]?.[0] as URL).href).toBe(
      'https://vm.tiktok.com/Zabc/',
    );
  });
  it('supports relative and protocol-relative redirects only to allowed hosts', async () => {
    reply(302, '/Znext/');
    reply(303, '//tiktok.com/@creator/video/123');
    reply(200);
    await expect(
      resolveTikTokLink('https://vt.tiktok.com/Zabc/', signal()),
    ).resolves.toBe(full);
    expect(mocks.lookup).toHaveBeenCalledTimes(4); // canonical www checked too
  });
  it('detects loops without fetching a visited URL again', async () => {
    reply(302, 'https://vt.tiktok.com/Znext/');
    reply(302, 'https://vm.tiktok.com/Zabc/');
    await expect(
      resolveTikTokLink('https://vm.tiktok.com/Zabc/', signal()),
    ).rejects.toMatchObject({ code: 'SHORT_LINK_FAILED' });
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
  it('permits exactly three redirects and rejects the fourth before following it', async () => {
    for (let index = 0; index < 4; index++) reply(302, `/Z${String(index)}/`);
    await expect(
      resolveTikTokLink('https://vm.tiktok.com/Zabc/', signal()),
    ).rejects.toMatchObject({ code: 'SHORT_LINK_FAILED' });
    expect(mocks.request).toHaveBeenCalledTimes(4);
  });
  it('resolves a chain at the redirect limit', async () => {
    reply(301, '/Zone/');
    reply(302, '/Ztwo/');
    reply(308, full);
    reply(200);
    await expect(
      resolveTikTokLink('https://vm.tiktok.com/Zabc/', signal()),
    ).resolves.toBe(full);
  });
  it.each([
    'https://attacker.example/video',
    'https://tiktok.com.attacker.example/@a/video/1',
    'https://evil.tiktok.com/@a/video/1',
    'http://www.tiktok.com/@a/video/1',
    'https://a:b@www.tiktok.com/@a/video/1',
    'https://@www.tiktok.com/@a/video/1',
    'https://www.tiktok.com:443/@a/video/1',
    'https://www.tiktok.com:8443/@a/video/1',
    'https://www.tiktok.com./@a/video/1',
    'https://%74iktok.com/@a/video/1',
    'https:///www.tiktok.com/@a/video/1',
    'https://www。tiktok.com/@a/video/1',
    'https://www.tiktok.com\\@attacker.example/@a/video/1',
    'https://127.0.0.1/x',
    'https://[::1]/x',
    '//user@www.tiktok.com/@a/video/1',
    '/../@a/video/1',
    'https://www.tiktok.com/@a/video/1\n',
    'javascript:alert(1)',
  ])('rejects unsafe redirect before DNS/fetch: %s', async (location) => {
    reply(302, location);
    await expect(
      resolveTikTokLink('https://vm.tiktok.com/Zabc/', signal()),
    ).rejects.toMatchObject({ code: 'SHORT_LINK_FAILED' });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });
  it.each([
    'https://vt.tiktok.com/',
    'https://vm.tiktok.com/abc/extra',
    'not a URL',
    'https://vt.tiktok.com.attacker.example/Zabc/',
    'https://vm.tiktok.com:443/Zabc/',
  ])('rejects malformed submitted URL without DNS: %s', async (input) => {
    await expect(resolveTikTokLink(input, signal())).rejects.toThrow();
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it.each([
    ['10.0.0.1', 4],
    ['127.0.0.1', 4],
    ['169.254.169.254', 4],
    ['168.63.129.16', 4],
    ['172.16.1.2', 4],
    ['192.168.1.1', 4],
    ['224.0.0.1', 4],
    ['240.0.0.1', 4],
    ['198.18.0.1', 4],
    ['100.64.0.1', 4],
    ['::1', 6],
    ['::', 6],
    ['fc00::1', 6],
    ['fd00:ec2::254', 6],
    ['fe80::1', 6],
    ['ff02::1', 6],
    ['::ffff:127.0.0.1', 6],
    ['64:ff9b::a00:1', 6],
    ['2001:db8::1', 6],
    ['2002:a00:1::1', 6],
    ['3fff::1', 6],
  ] as const)(
    'rejects nonpublic DNS address %s before connecting',
    async (address, family) => {
      mocks.lookup.mockResolvedValue([{ address, family }]);
      await expect(
        resolveTikTokLink('https://vt.tiktok.com/Zabc/', signal()),
      ).rejects.toMatchObject({ code: 'SHORT_LINK_FAILED' });
      expect(mocks.request).not.toHaveBeenCalled();
      expect(publicAddress(address)).toBe(false);
    },
  );
  it('rejects a mixed public/private answer and mismatched family', async () => {
    for (const entries of [
      [
        { address: '8.8.8.8', family: 4 },
        { address: 'fc00::1', family: 6 },
      ],
      [{ address: '8.8.8.8', family: 6 }],
      [],
    ]) {
      mocks.lookup.mockResolvedValue(entries);
      await expect(
        resolveTikTokLink('https://vm.tiktok.com/Zabc/', signal()),
      ).rejects.toThrow();
    }
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('pins public IPv6 and IPv4 without a second resolver call for the connection', async () => {
    mocks.lookup.mockResolvedValue([{ address: '2606:4700:4700::1111', family: 6 }]);
    reply(302, full);
    reply(200);
    await resolveTikTokLink('https://vm.tiktok.com/Zabc/', signal());
    const options = mocks.request.mock.calls[0]?.[1] as RequestOptions;
    const pinnedLookup = options.lookup as (
      host: string,
      options: object,
      callback: (error: null, address: string, family: number) => void,
    ) => void;
    const callback = vi.fn();
    pinnedLookup('vm.tiktok.com', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '2606:4700:4700::1111', 6);
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
  });
  it('pins IPv4 even if a subsequent DNS response changes', async () => {
    reply(302, full);
    reply(200);
    await resolveTikTokLink('https://vm.tiktok.com/Zabc/', signal());
    mocks.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    const options = mocks.request.mock.calls[0]?.[1] as RequestOptions;
    const pinnedLookup = options.lookup as (
      host: string,
      options: object,
      callback: (error: null, address: string, family: number) => void,
    ) => void;
    const callback = vi.fn();
    pinnedLookup('vm.tiktok.com', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
  });
  it('rechecks DNS on every hop and blocks a rebinding change', async () => {
    mocks.lookup
      .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    reply(302, '/Znext/');
    await expect(
      resolveTikTokLink('https://vt.tiktok.com/Zabc/', signal()),
    ).rejects.toThrow();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it.each([200, 403, 404, 429])(
    'fails closed when short URL returns status %s without a public video destination',
    async (status) => {
      reply(status);
      await expect(
        resolveTikTokLink('https://vt.tiktok.com/Zabc/', signal()),
      ).rejects.toMatchObject({ code: 'SHORT_LINK_FAILED' });
    },
  );
  it('bounds stalled DNS by the total budget and releases abort listeners', async () => {
    vi.useFakeTimers();
    mocks.lookup.mockReturnValue(new Promise(() => undefined));
    const pending = expect(
      resolveTikTokLink('https://vm.tiktok.com/Zabc/', signal()),
    ).rejects.toMatchObject({ code: 'ANALYSIS_TIMEOUT', status: 504 });
    await vi.advanceTimersByTimeAsync(SHORT_LINK_LIMITS.totalMs);
    await pending;
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('terminates a stalled connection', async () => {
    vi.useFakeTimers();
    const req = reply(200, undefined, true);
    const pending = expect(
      resolveTikTokLink('https://vm.tiktok.com/Zabc/', signal()),
    ).rejects.toMatchObject({ code: 'ANALYSIS_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(SHORT_LINK_LIMITS.connectMs);
    await pending;
    expect(req.destroy).toHaveBeenCalled();
  });
  it('terminates missing response headers after TLS has connected', async () => {
    vi.useFakeTimers();
    const req = reply(200, undefined, 'response');
    const pending = expect(
      resolveTikTokLink('https://vm.tiktok.com/Zabc/', signal()),
    ).rejects.toMatchObject({ code: 'ANALYSIS_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(SHORT_LINK_LIMITS.responseMs / 2);
    expect(req.destroy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SHORT_LINK_LIMITS.responseMs / 2);
    await pending;
    expect(req.destroy).toHaveBeenCalled();
  });
  it('does not reset the total deadline between redirects and DNS lookups', async () => {
    vi.useFakeTimers();
    mocks.lookup.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve([{ address: '8.8.8.8', family: 4 }]), 3000),
        ),
    );
    reply(302, '/Znext/');
    reply(302, '/Zfinal/');
    const pending = expect(
      resolveTikTokLink('https://vm.tiktok.com/Zabc/', signal()),
    ).rejects.toMatchObject({ code: 'ANALYSIS_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(SHORT_LINK_LIMITS.totalMs);
    await pending;
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
  it('honors a shorter enclosing analysis budget', async () => {
    vi.useFakeTimers();
    mocks.lookup.mockReturnValue(new Promise(() => undefined));
    const pending = expect(
      resolveTikTokLink('https://vm.tiktok.com/Zabc/', signal(), 500),
    ).rejects.toMatchObject({ code: 'ANALYSIS_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(500);
    await pending;
  });
  it('cancels resolution on client disconnect and hides raw DNS errors', async () => {
    mocks.lookup.mockReturnValueOnce(new Promise(() => undefined));
    const controller = new AbortController();
    const pending = expect(
      resolveTikTokLink('https://vm.tiktok.com/Zabc/', controller.signal),
    ).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
    controller.abort();
    await pending;
    mocks.lookup.mockRejectedValueOnce(
      new Error('cookie secret /internal/path signed-url'),
    );
    await expect(
      resolveTikTokLink('https://vm.tiktok.com/Zabc/', signal()),
    ).rejects.toMatchObject({
      message: expect.not.stringMatching(/secret|internal|signed/),
    });
  });
});
