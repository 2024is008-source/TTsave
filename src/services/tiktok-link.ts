import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import type { LookupAddress } from 'node:dns';
import { HttpError } from '../middleware/error-handler.js';
import {
  tiktokUrlSchema,
  videoUrlSchema,
  MAX_VIDEO_URL_LENGTH,
} from '../shared/video-url.js';
import { publicAddress } from './public-address.js';

export const SHORT_LINK_LIMITS = {
  redirects: 3,
  totalMs: 8000,
  connectMs: 2000,
  responseMs: 2000,
} as const;
const failure = () =>
  new HttpError(
    502,
    'SHORT_LINK_FAILED',
    'The public TikTok shared link could not be resolved. Try its full public video link.',
  );
const timeout = () =>
  new HttpError(
    504,
    'ANALYSIS_TIMEOUT',
    'The public video analysis timed out. Please try again later.',
  );
const canonical = (url: URL) =>
  /^\/@[a-zA-Z0-9._]+\/video\/\d+\/?$/.test(url.pathname)
    ? `https://www.tiktok.com${url.pathname.replace(/\/$/, '')}`
    : null;

async function addressesFor(
  hostname: string,
  signal: AbortSignal,
): Promise<LookupAddress[]> {
  signal.throwIfAborted();
  let abort: (() => void) | undefined;
  const addresses = await Promise.race([
    lookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_resolve, reject) => {
      abort = () => reject(timeout());
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    }),
  ]).finally(() => {
    if (abort) signal.removeEventListener('abort', abort);
  });
  signal.throwIfAborted();
  if (
    !addresses.length ||
    addresses.some(
      (entry) => !publicAddress(entry.address) || isIP(entry.address) !== entry.family,
    )
  )
    throw failure();
  return addresses;
}

function redirectUrl(location: string, previous: URL): URL {
  if (
    !location ||
    location.length > MAX_VIDEO_URL_LENGTH ||
    /[\s\\\p{Cc}]/u.test(location)
  )
    throw failure();
  // Validate raw absolute authority before URL can repair/decode a malicious host.
  if (/^[a-z][a-z\d+.-]*:/i.test(location))
    return new URL(tiktokUrlSchema.parse(location));
  if (location.startsWith('//'))
    return new URL(tiktokUrlSchema.parse(`https:${location}`));
  if (/(?:^|\/)(?:\.|%2e){1,2}(?:\/|[?#]|$)/i.test(location)) throw failure();
  return new URL(tiktokUrlSchema.parse(new URL(location, previous).href));
}

async function headers(url: URL, address: LookupAddress, signal: AbortSignal) {
  return new Promise<{ status: number; location?: string }>((resolve, reject) => {
    // New connection for every hop; SNI/certificate validation still uses hostname.
    const req = request(
      url,
      {
        method: 'GET',
        agent: false,
        signal,
        family: address.family,
        rejectUnauthorized: true,
        maxHeaderSize: 8192,
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
        headers: {
          Accept: 'text/html',
          'Accept-Encoding': 'identity',
          'User-Agent': 'TikSaveMp4/0.1 (+https://tiksavemp4.online)',
        },
      },
      (response) => {
        clearTimeout(connectTimer);
        clearTimeout(responseTimer);
        // Resolve from headers only. Never buffer/parse HTML, JS redirects or cookies.
        const value = {
          status: response.statusCode ?? 0,
          ...(response.headers.location ? { location: response.headers.location } : {}),
        };
        resolve(value);
        response.destroy();
      },
    );
    const connectTimer = setTimeout(
      () => req.destroy(timeout()),
      SHORT_LINK_LIMITS.connectMs,
    );
    let responseTimer = setTimeout(
      () => req.destroy(timeout()),
      SHORT_LINK_LIMITS.responseMs + SHORT_LINK_LIMITS.connectMs,
    );
    req.once('socket', (socket) =>
      socket.once('secureConnect', () => {
        clearTimeout(connectTimer);
        clearTimeout(responseTimer);
        responseTimer = setTimeout(
          () => req.destroy(timeout()),
          SHORT_LINK_LIMITS.responseMs,
        );
      }),
    );
    req.once('error', reject);
    req.once('close', () => {
      clearTimeout(connectTimer);
      clearTimeout(responseTimer);
    });
    req.end();
  });
}

/** Resolves only submitted TikTok short codes; existing full URLs need no extra fetch. */
export async function resolveTikTokLink(
  input: string,
  callerSignal: AbortSignal,
  budgetMs: number = SHORT_LINK_LIMITS.totalMs,
): Promise<string> {
  let url = new URL(videoUrlSchema.parse(input));
  const isCancelled = () => callerSignal.aborted;
  if (isCancelled())
    throw new HttpError(499, 'REQUEST_CANCELLED', 'The analysis request was cancelled.');
  const full = canonical(url);
  if (full) return full;
  // A short code is sufficient; do not forward client-supplied tracking parameters.
  url.search = '';
  url.hash = '';
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(timeout()),
    Math.min(SHORT_LINK_LIMITS.totalMs, Math.max(1, budgetMs)),
  );
  const signal = AbortSignal.any([callerSignal, controller.signal]);
  const visited = new Set<string>();
  let redirects = 0;
  try {
    while (redirects <= SHORT_LINK_LIMITS.redirects) {
      signal.throwIfAborted();
      url.hash = '';
      if (visited.has(url.href)) throw failure();
      visited.add(url.href);
      const addresses = await addressesFor(url.hostname, signal);
      const pinned = addresses.find((entry) => entry.family === 4) ?? addresses[0];
      if (!pinned) throw failure();
      const response = await headers(url, pinned, signal);
      signal.throwIfAborted();
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (!response.location || redirects >= SHORT_LINK_LIMITS.redirects)
          throw failure();
        url = redirectUrl(response.location, url);
        redirects += 1;
        continue;
      }
      const normalized = canonical(url);
      if (response.status !== 200 || !normalized) throw failure();
      if (url.hostname !== 'www.tiktok.com') await addressesFor('www.tiktok.com', signal);
      return normalized;
    }
    throw failure();
  } catch (error) {
    if (isCancelled())
      throw new HttpError(
        499,
        'REQUEST_CANCELLED',
        'The analysis request was cancelled.',
      );
    if (
      controller.signal.aborted ||
      (error instanceof HttpError && error.code === 'ANALYSIS_TIMEOUT')
    )
      throw timeout();
    throw failure();
  } finally {
    clearTimeout(timer);
  }
}
