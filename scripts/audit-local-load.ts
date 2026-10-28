import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { createApp } from '../src/app.js';

// Bounded first-party liveness only. This is not a TikTok/FFmpeg capacity benchmark.
const app = createApp();
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw Error('No local listener');
const base = `http://127.0.0.1:${String(address.port)}`;
const start = performance.now(),
  memory = process.memoryUsage().heapUsed;
const durations: number[] = [];
let next = 0;
try {
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < 40) {
        next++;
        const began = performance.now();
        const response = await fetch(base + '/health', {
          signal: AbortSignal.timeout(10000),
        });
        await response.text();
        if (response.status !== 200) throw Error('Local liveness request failed');
        durations.push(performance.now() - began);
      }
    }),
  );
  durations.sort((a, b) => a - b);
  process.stdout.write(
    JSON.stringify(
      {
        scope:
          '40 loopback health requests, four concurrent clients; no provider/media traffic; not VPS capacity',
        requests: durations.length,
        concurrency: 4,
        elapsedMs: Math.round(performance.now() - start),
        p95Ms: Math.round(durations[Math.floor(durations.length * 0.95)] ?? 0),
        heapDeltaBytes: process.memoryUsage().heapUsed - memory,
        passed: durations.length === 40,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
