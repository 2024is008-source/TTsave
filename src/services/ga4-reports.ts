import { readFile, stat } from 'node:fs/promises';
import { createSign } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
const accountSchema = z.object({
  client_email: z.email(),
  private_key: z.string().min(100),
  token_uri: z.literal('https://oauth2.googleapis.com/token'),
});
const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive().max(7200),
});
const reportSchema = z.object({
  reports: z.array(
    z.object({
      dimensionHeaders: z.array(z.object({ name: z.string() })).optional(),
      metricHeaders: z.array(z.object({ name: z.string() })).optional(),
      rows: z
        .array(
          z.object({
            dimensionValues: z.array(z.object({ value: z.string() })),
            metricValues: z.array(z.object({ value: z.string() })),
          }),
        )
        .optional(),
    }),
  ),
});
let token: { value: string; expires: number; file: string } | undefined;
let cached:
  { key: string; expires: number; value: Awaited<ReturnType<typeof query>> } | undefined;
async function json(response: Response): Promise<unknown> {
  if (!response.ok)
    throw Error(
      'Authorized GA4 reporting is unavailable. Check property access and credentials.',
    );
  const reader = response.body?.getReader();
  if (!reader) throw Error('Empty GA4 response.');
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 1024 * 1024) throw Error('GA4 response exceeded its limit.');
      parts.push(chunk.value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
}
async function accessToken(file: string) {
  if (token?.file === file && token.expires > Date.now()) return token.value;
  if ((await stat(file)).size > 65536) throw Error('Invalid GA4 credential file.');
  const account = accountSchema.parse(
    JSON.parse(await readFile(file, 'utf8')) as unknown,
  );
  const now = Math.floor(Date.now() / 1000),
    encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned =
    encode({ alg: 'RS256', typ: 'JWT' }) +
    '.' +
    encode({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: account.token_uri,
      iat: now,
      exp: now + 3600,
    });
  const signature = createSign('RSA-SHA256')
    .update(unsigned)
    .sign(account.private_key)
    .toString('base64url');
  const result = tokenSchema.parse(
    await json(
      await fetch(account.token_uri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: unsigned + '.' + signature,
        }),
        signal: AbortSignal.timeout(8000),
      }),
    ),
  );
  token = {
    value: result.access_token,
    expires: Date.now() + (result.expires_in - 60) * 1000,
    file,
  };
  return token.value;
}
async function query(property: string, file: string, from: string, to: string) {
  const definitions = [
    {
      name: 'Overview',
      dimensions: [],
      metrics: ['activeUsers', 'sessions', 'screenPageViews'],
    },
    { name: 'Popular pages', dimensions: ['pagePath'], metrics: ['screenPageViews'] },
    {
      name: 'Session acquisition',
      dimensions: ['sessionSource', 'sessionMedium'],
      metrics: ['sessions'],
    },
    { name: 'Countries', dimensions: ['country'], metrics: ['activeUsers'] },
    {
      name: 'Download events by country',
      dimensions: ['eventName', 'country'],
      metrics: ['eventCount'],
    },
  ];
  const data = reportSchema.parse(
    await json(
      await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${property}:batchRunReports`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + (await accessToken(file)),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: definitions.map((definition) => ({
              dateRanges: [{ startDate: from, endDate: to }],
              dimensions: definition.dimensions.map((name) => ({ name })),
              metrics: definition.metrics.map((name) => ({ name })),
              limit: '50',
              ...(definition.name === 'Download events by country'
                ? {
                    dimensionFilter: {
                      filter: {
                        fieldName: 'eventName',
                        stringFilter: { matchType: 'BEGINS_WITH', value: 'download_' },
                      },
                    },
                  }
                : {}),
            })),
          }),
          signal: AbortSignal.timeout(10000),
        },
      ),
    ),
  );
  return definitions.map((definition, index) => ({
    name: definition.name,
    headers: [...definition.dimensions, ...definition.metrics],
    rows: (data.reports[index]?.rows ?? []).map((row) => [
      ...row.dimensionValues.map((value) => value.value),
      ...row.metricValues.map((value) => value.value),
    ]),
  }));
}
export async function ga4Reports(from: string, to: string) {
  if (!env.GA4_PROPERTY_ID || !env.GA4_SERVICE_ACCOUNT_FILE)
    return {
      available: false as const,
      message:
        'GA4 reports are not configured. A measurement ID alone cannot read reports.',
      reports: [],
    };
  const key = env.GA4_PROPERTY_ID + ':' + from + ':' + to;
  try {
    if (cached?.key === key && cached.expires > Date.now())
      return {
        available: true as const,
        message:
          'Authorized GA4 Data API reports. Google processing delays and thresholds may apply.',
        reports: cached.value,
      };
    const value = await query(
      env.GA4_PROPERTY_ID,
      env.GA4_SERVICE_ACCOUNT_FILE,
      from,
      to,
    );
    cached = { key, expires: Date.now() + 120000, value };
    return {
      available: true as const,
      message:
        'Authorized GA4 Data API reports. Google processing delays and thresholds may apply.',
      reports: value,
    };
  } catch {
    return {
      available: false as const,
      message:
        'GA4 reports could not be read. Check the service account, property permissions and network access.',
      reports: [],
    };
  }
}
