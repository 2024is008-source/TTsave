import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { env, type Environment } from '../config/env.js';
import { HttpError } from '../middleware/error-handler.js';
import {
  AdminSessions,
  equalAdminValue,
  verifyAdminPassword,
} from '../services/admin-auth.js';
import { createAdminMonitor, type AdminMonitor } from '../services/admin-monitor.js';
import { ga4Reports } from '../services/ga4-reports.js';
import { rangeSchema, type OperationsStore } from '../services/operational-analytics.js';
import type { DownloaderService } from '../services/memory-store.js';

export type AdminOptions = {
  config?: Environment;
  sessions?: AdminSessions;
  monitor?: AdminMonitor;
  google?: typeof ga4Reports;
};
const credentials = z
  .object({
    username: z.string().min(1).max(128),
    password: z.string().min(1).max(256),
    csrf: z.string().length(43),
  })
  .strict();
const query = z
  .object({ from: z.string().optional(), to: z.string().optional() })
  .strict();
const csrfError = () =>
  new HttpError(
    403,
    'ADMIN_CSRF_INVALID',
    'The request expired or could not be verified. Reload the sign-in page.',
  );

function cookieToken(request: Request, name: string) {
  const header = request.get('Cookie') ?? '';
  if (header.length > 8192) return undefined;
  const matches = header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(name + '='));
  return matches.length === 1 ? matches[0]?.slice(name.length + 1) : undefined;
}
function permittedOrigin(request: Request, config: Environment) {
  if (request.get('Sec-Fetch-Site') === 'cross-site') return false;
  const origin = request.get('Origin');
  if (!origin) return true; // Synchronizer CSRF token is still mandatory.
  if (origin === config.PUBLIC_BASE_URL) return true;
  return (
    config.NODE_ENV !== 'production' &&
    /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/.test(origin)
  );
}
function safeGoogle(result: Awaited<ReturnType<typeof ga4Reports>>) {
  return {
    available: result.available,
    message: result.message,
    reports: result.reports
      .filter((report) => ['Overview', 'Countries'].includes(report.name))
      .map((report) => ({
        name: report.name,
        headers: report.headers,
        rows: report.rows.map((row) =>
          row.map((value, index) =>
            report.headers[index] === 'country'
              ? /^[\p{L}\p{M}\s()'-]{1,80}$/u.test(value)
                ? value
                : '[redacted]'
              : /^\d+(?:\.\d+)?$/.test(value)
                ? value
                : '[unavailable]',
          ),
        ),
      })),
  };
}

export function createAdminRouter(
  service: DownloaderService,
  ready: () => boolean,
  store?: OperationsStore,
  options: AdminOptions = {},
) {
  const router = Router(),
    config = options.config ?? env;
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none';style-src 'self';font-src 'self';img-src 'self';form-action 'self';base-uri 'none';frame-ancestors 'none';object-src 'none';script-src 'none'",
    );
    next();
  });
  if (!config.ADMIN_ENABLED) {
    router.use((_request, _response, next) =>
      next(new HttpError(404, 'NOT_FOUND', 'This page does not exist.')),
    );
    return router;
  }
  if (!config.ADMIN_USERNAME || !config.ADMIN_PASSWORD_HASH)
    throw new Error(
      'Admin credentials must be configured before enabling the dashboard.',
    );
  const username = config.ADMIN_USERNAME,
    passwordHash = config.ADMIN_PASSWORD_HASH;
  const sessions =
    options.sessions ??
    new AdminSessions(
      config.ADMIN_SESSION_TTL_MINUTES * 60000,
      config.ADMIN_SESSION_MAX_HOURS * 3600000,
    );
  const monitor = options.monitor ?? createAdminMonitor(service, ready, config),
    google = options.google ?? ga4Reports;
  const name =
    config.NODE_ENV === 'production' ? '__Secure-ttsave_admin' : 'ttsave_admin';
  const cookie = {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/admin',
  };
  const limiter = (limit: number, windowMs: number) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_request, _response, next) =>
        next(
          new HttpError(
            429,
            'ADMIN_RATE_LIMITED',
            'Too many requests. Please try again later.',
          ),
        ),
    });
  router.get('/login', limiter(30, 60000), (request, response) => {
    const token = cookieToken(request, name),
      current = sessions.get(token);
    if (current?.authenticated) {
      response.redirect(303, '/admin');
      return;
    }
    const created = current ? { token, session: current } : sessions.create();
    if (created.token)
      response.cookie(name, created.token, { ...cookie, maxAge: 10 * 60000 });
    response.render('admin-login', { csrf: created.session.csrf, error: null });
  });
  router.post('/login', limiter(5, 15 * 60000), async (request, response) => {
    const token = cookieToken(request, name),
      session = sessions.get(token);
    const body = credentials.safeParse(request.body as unknown);
    if (
      !body.success ||
      !permittedOrigin(request, config) ||
      !sessions.csrf(session, body.data.csrf)
    )
      throw csrfError();
    const validPassword = await verifyAdminPassword(body.data.password, passwordHash);
    if (!validPassword || !equalAdminValue(body.data.username, username)) {
      response.status(401).render('admin-login', {
        csrf: session?.csrf,
        error: 'The username or password is incorrect.',
      });
      return;
    }
    sessions.revoke(token);
    const authenticated = sessions.create(true);
    response.cookie(name, authenticated.token, {
      ...cookie,
      maxAge: config.ADMIN_SESSION_TTL_MINUTES * 60000,
    });
    response.redirect(303, '/admin');
  });
  router.use((request, response, next) => {
    const token = cookieToken(request, name),
      session = sessions.get(token);
    if (!session?.authenticated) {
      if (request.method === 'GET' && !request.path.startsWith('/api/'))
        response.redirect(303, '/admin/login');
      else
        next(
          new HttpError(
            401,
            'ADMIN_AUTH_REQUIRED',
            'Sign in to access the private dashboard.',
          ),
        );
      return;
    }
    sessions.touch(session);
    response.locals.adminSession = session;
    response.cookie(name, token ?? '', {
      ...cookie,
      maxAge: Math.min(
        config.ADMIN_SESSION_TTL_MINUTES * 60000,
        session.created + config.ADMIN_SESSION_MAX_HOURS * 3600000 - Date.now(),
      ),
    });
    next();
  });
  router.post('/logout', (request, response) => {
    const token = cookieToken(request, name),
      session = sessions.get(token);
    const body = z
      .object({ csrf: z.string() })
      .strict()
      .safeParse(request.body as unknown);
    if (
      !body.success ||
      !permittedOrigin(request, config) ||
      !sessions.csrf(session, body.data.csrf)
    )
      throw csrfError();
    sessions.revoke(token);
    response.clearCookie(name, cookie);
    response.redirect(303, '/admin/login');
  });
  router.get(['/', '/api/overview'], limiter(30, 60000), async (request, response) => {
    const input = query.parse(request.query);
    const range = rangeSchema.parse({
      from: input.from ?? new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
      to: input.to ?? new Date().toISOString().slice(0, 10),
    });
    if (
      !range.from ||
      !range.to ||
      Date.parse(range.to) - Date.parse(range.from) > 729 * 86400000
    )
      throw new HttpError(
        400,
        'ADMIN_RANGE_INVALID',
        'Choose an ordered range of up to 730 days.',
      );
    let operations: ReturnType<OperationsStore['report']> | null = null;
    let operationsMessage =
      'Operational recording is disabled. No download totals are available.';
    try {
      operations = store?.report(range) ?? null;
    } catch {
      operationsMessage = 'Operational reporting is temporarily unavailable.';
    }
    const [system, traffic] = await Promise.all([
      monitor(),
      google(range.from, range.to),
    ]);
    const data = {
      range,
      operations,
      operationsMessage,
      system,
      google: safeGoogle(traffic),
    };
    if (request.path === '/api/overview') response.json(data);
    else
      response.render('admin-dashboard', {
        ...data,
        statLabels: [
          ['attempts', 'Download attempts'],
          ['delivered', 'Successful deliveries'],
          ['failed', 'Failed jobs'],
          ['prepared', 'Prepared files'],
        ],
        mediaLabels: [
          ['mp4', 'MP4 video'],
          ['mp3', 'MP3 audio'],
          ['image', 'Photo'],
          ['zip', 'ZIP archive'],
          ['unknown', 'Unknown'],
        ],
        toolLabels: [
          ['ytDlp', 'yt-dlp'],
          ['ffmpeg', 'FFmpeg'],
          ['ffprobe', 'FFprobe'],
          ['chrome', 'Chrome target'],
          ['mp3', 'MP3 encoder'],
        ],
        availability: (value: boolean | undefined) =>
          value === undefined ? 'Not checked' : value ? 'Available' : 'Unavailable',
        csrf: (response.locals.adminSession as { csrf: string }).csrf,
        number: (value: unknown) =>
          typeof value === 'number' && Number.isFinite(value)
            ? value.toLocaleString('en-US')
            : 'Unavailable',
        bytes: (value: number | undefined) =>
          value === undefined
            ? 'Unavailable'
            : `${(value / 1048576).toLocaleString('en-US', { maximumFractionDigits: 1 })} MiB`,
      });
  });
  return router;
}
