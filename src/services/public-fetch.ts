import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { request } from 'node:https';
import { isIP } from 'node:net';
import type { ZodType } from 'zod';
import { publicAddress } from './public-address.js';
import { HttpError } from '../middleware/error-handler.js';

const unavailable = () =>
  new HttpError(
    502,
    'SOURCE_UNAVAILABLE',
    'The source is temporarily unavailable. Please try again.',
  );
const timeout = () =>
  new HttpError(504, 'SOURCE_TIMEOUT', 'The request took too long. Please try again.');

/** Each hop has its own DNS validation and fresh pinned TLS connection. No cookies. */
export async function publicFetch(
  input: string,
  schema: ZodType<string>,
  caller: AbortSignal,
  maxBytes: number,
  accept: string,
  budgetMs = 8000,
): Promise<{ bytes: Buffer; contentType: string }> {
  const deadline = AbortSignal.timeout(Math.min(8000, Math.max(1, Math.floor(budgetMs))));
  const signal = AbortSignal.any([caller, deadline]);
  const visited = new Set<string>();
  let current = input;
  try {
    for (let hop = 0; hop <= 2; hop++) {
      signal.throwIfAborted();
      const parsed = schema.safeParse(current);
      if (!parsed.success || visited.has(parsed.data)) throw unavailable();
      current = parsed.data;
      visited.add(current);
      const url = new URL(current);
      const addresses = await new Promise<LookupAddress[]>((resolve, reject) => {
        const abort = () => reject(timeout());
        signal.addEventListener('abort', abort, { once: true });
        void lookup(url.hostname, { all: true, verbatim: true })
          .then(resolve, reject)
          .finally(() => signal.removeEventListener('abort', abort));
        if (signal.aborted) abort();
      });
      if (
        !addresses.length ||
        addresses.some((a) => !publicAddress(a.address) || isIP(a.address) !== a.family)
      )
        throw unavailable();
      const pinned = addresses.find((a) => a.family === 4) ?? addresses[0];
      if (!pinned) throw unavailable();
      const result = await new Promise<{
        bytes: Buffer;
        contentType: string;
        location?: string;
      }>((resolve, reject) => {
        const req = request(
          url,
          {
            agent: false,
            signal,
            family: pinned.family,
            rejectUnauthorized: true,
            maxHeaderSize: 8192,
            lookup: (_host, _options, callback) =>
              callback(null, pinned.address, pinned.family),
            headers: {
              Accept: accept,
              'Accept-Encoding': 'identity',
              'User-Agent': 'TikSaveMp4/0.1 (+https://tiksavemp4.online)',
            },
          },
          (response) => {
            clearTimeout(connect);
            clearTimeout(headers);
            const status = response.statusCode ?? 0;
            if ([301, 302, 303, 307, 308].includes(status)) {
              const location = response.headers.location;
              response.destroy();
              if (!location || /[\s\\\p{Cc}]/u.test(location) || location.length > 4096) {
                reject(unavailable());
                return;
              }
              // Validate literal authority before WHATWG can repair it.
              const destination = /^[a-z][a-z\d+.-]*:/i.test(location)
                ? location
                : location.startsWith('//')
                  ? `https:${location}`
                  : new URL(location, url).href;
              const checked = schema.safeParse(destination);
              if (!checked.success) {
                reject(unavailable());
                return;
              }
              resolve({
                bytes: Buffer.alloc(0),
                contentType: '',
                location: checked.data,
              });
              return;
            }
            const contentType =
              response.headers['content-type']?.split(';')[0]?.trim().toLowerCase() ?? '';
            const length = response.headers['content-length'];
            if (
              status !== 200 ||
              (response.headers['content-encoding'] &&
                response.headers['content-encoding'] !== 'identity') ||
              (length && (!/^\d+$/.test(length) || Number(length) > maxBytes))
            ) {
              response.destroy();
              reject(unavailable());
              return;
            }
            let size = 0;
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => {
              size += chunk.length;
              if (size > maxBytes) {
                response.destroy(unavailable());
                return;
              }
              chunks.push(chunk);
            });
            response.once('error', reject);
            response.once('aborted', () => reject(unavailable()));
            response.once('end', () =>
              resolve({ bytes: Buffer.concat(chunks, size), contentType }),
            );
          },
        );
        const connect = setTimeout(() => req.destroy(timeout()), 2000);
        let headers = setTimeout(() => req.destroy(timeout()), 4000);
        req.once('socket', (socket) =>
          socket.once('secureConnect', () => {
            clearTimeout(connect);
            clearTimeout(headers);
            headers = setTimeout(() => req.destroy(timeout()), 2000);
          }),
        );
        req.once('error', reject);
        req.once('close', () => {
          clearTimeout(connect);
          clearTimeout(headers);
        });
        req.end();
      });
      signal.throwIfAborted();
      if (result.location) {
        current = result.location;
        continue;
      }
      return result;
    }
    throw unavailable();
  } catch {
    if (caller.aborted)
      throw new HttpError(499, 'REQUEST_CANCELLED', 'The request was cancelled.');
    if (deadline.aborted) throw timeout();
    throw unavailable();
  }
}
