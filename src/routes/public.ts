import { Router } from 'express';
import helmet from 'helmet';
import { env } from '../config/env.js';
import { legalPages } from '../data/legal-pages.js';
import { mockData } from '../data/mock-data.js';
import { escapeXml, faqPage, serializeJsonLd, webApplication } from '../services/seo.js';

export const publicRouter = Router();
const pages = [
  {
    path: '/',
    title: 'TikTok Downloader – Download MP4, MP3 & Photos | TikSaveMP4',
    description:
      'Download supported public TikTok videos as MP4, convert available audio to MP3, or save photos from supported image posts. Available options depend on the source.',
  },
  ...legalPages,
];
const sitemapPaths = pages.map((page) => page.path);
// Applied only to rendered public pages; API/file/preview/SSE policies stay unchanged.
const analyticsCsp = helmet.contentSecurityPolicy({
  directives: {
    scriptSrc: ["'self'", 'https://www.googletagmanager.com'],
    connectSrc: [
      "'self'",
      'https://*.google-analytics.com',
      'https://www.googletagmanager.com',
    ],
    imgSrc: [
      "'self'",
      'https://*.google-analytics.com',
      'https://www.googletagmanager.com',
    ],
  },
});

publicRouter.use((request, response, next) => {
  const publicPath = pages.find(
    (page) =>
      page.path.toLowerCase() === request.path.toLowerCase().replace(/\/$/, '') ||
      (page.path === '/' && request.path === '/'),
  )?.path;
  const crawlerPath = ['/robots.txt', '/sitemap.xml'].find(
    (path) => path === request.path.toLowerCase().replace(/\/$/, ''),
  );
  const destination = publicPath ?? crawlerPath;
  if (
    ['GET', 'HEAD'].includes(request.method) &&
    destination &&
    (/^www\.tiksavemp4\.online(?::(?:80|443))?$/i.test(request.get('Host') ?? '') ||
      request.path !== destination ||
      (env.NODE_ENV === 'production' &&
        !request.secure &&
        /^tiksavemp4\.online(?::(?:80|443))?$/i.test(request.get('Host') ?? '')))
  ) {
    response.redirect(301, env.PUBLIC_BASE_URL + destination);
    return;
  }
  next();
});

for (const page of pages) {
  publicRouter.get(page.path, (request, response) => {
    if (page.path !== '/' && request.path.endsWith('/')) {
      response.redirect(301, env.PUBLIC_BASE_URL + page.path);
      return;
    }
    const hasQuery = request.originalUrl.includes('?');
    if (env.GA_MEASUREMENT_ID)
      analyticsCsp(request, response, () => {
        /* CSP only; rendering continues below. */
      });
    if (hasQuery) response.setHeader('X-Robots-Tag', 'noindex, follow');
    response.render(page.path === '/' ? 'index' : 'legal', {
      ...mockData,
      page,
      analytics: env.GA_MEASUREMENT_ID
        ? {
            measurementId: env.GA_MEASUREMENT_ID,
            pageLocation: env.PUBLIC_BASE_URL + page.path,
            pageTitle: page.title,
          }
        : null,
      contactEmail: env.LEGAL_CONTACT_EMAIL ?? env.PUBLIC_CONTACT_EMAIL,
      structuredData:
        page.path === '/'
          ? serializeJsonLd([webApplication(env.PUBLIC_BASE_URL), faqPage(mockData.faqs)])
          : null,
      jobRetentionMinutes: env.JOB_TTL_MS / 60_000,
      sweepSeconds: env.JOB_SWEEP_INTERVAL_MS / 1000,
      fileAccessSeconds: env.FILE_ACCESS_TTL_MS / 1000,
      seo: {
        title: page.path === '/' ? page.title : `${page.title} | TikSaveMp4`,
        description: page.description,
        canonical: env.PUBLIC_BASE_URL + page.path,
        image: env.PUBLIC_BASE_URL + '/assets/og/tiksavemp4-social-card.jpg',
        robots: hasQuery ? 'noindex, follow' : 'index, follow',
      },
    });
  });
}

publicRouter.get('/robots.txt', (_request, response) => {
  response
    .type('text/plain')
    .send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        'Disallow: /analyze',
        'Disallow: /health',
        'Disallow: /ready',
        'Disallow: /*?*',
        `Sitemap: ${env.PUBLIC_BASE_URL}/sitemap.xml`,
        '',
      ].join('\n'),
    );
});

publicRouter.get('/sitemap.xml', (_request, response) => {
  response
    .type('application/xml')
    .send(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        sitemapPaths
          .map((path) => `<url><loc>${escapeXml(env.PUBLIC_BASE_URL + path)}</loc></url>`)
          .join('') +
        '</urlset>',
    );
});
