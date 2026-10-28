import type { APIRequestContext, TestInfo } from '@playwright/test';

/** The offline crawler shares one real server/IP. Honor its production budget
 * before starting a test; never retry an assertion or disable a security limit. */
export async function reservePublicBudget(request: APIRequestContext, info: TestInfo) {
  const response = await request.head('/');
  if (![200, 429].includes(response.status()))
    throw new Error(`Public test preflight returned ${String(response.status())}.`);
  const header = response.headers().ratelimit ?? '';
  if (!/\br=\d+/.test(header) || !/\bt=\d+/.test(header))
    throw new Error('Public test preflight did not expose its rate budget.');
  const remaining = Number(/\br=(\d+)/.exec(header)?.[1] ?? Infinity);
  if (response.status() !== 429 && remaining >= 20) return;
  const reset = Number(
    /\bt=(\d+)/.exec(header)?.[1] ?? response.headers()['retry-after'] ?? 60,
  );
  const wait = Math.min(60000, Math.max(1000, reset * 1000 + 100));
  info.setTimeout(info.timeout + wait + 2000);
  await new Promise<void>((resolve) => setTimeout(resolve, wait));
}
