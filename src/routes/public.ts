import { Router } from 'express';
import helmet from 'helmet';
import { env } from '../config/env.js';
import { legalPages } from '../data/legal-pages.js';
import { mockData } from '../data/mock-data.js';
import { escapeXml, faqPage, serializeJsonLd, webApplication } from '../services/seo.js';
import { blogPosts, featuredBlogSlugs } from '../data/blog-posts.js';
import {
  blogDate,
  blogPage,
  blogSlugSchema,
  blogStructuredData,
  createBlogRegistry,
  type BlogPost,
} from '../services/blog.js';

const pages = [
  {
    path: '/',
    title: 'TikTok to MP4, MP3 & Image Downloader | TikSaveMP4',
    description:
      'Free and fast TikTok downloader. Save MP4 videos without watermark, convert audio to MP3, and download images online. No signup required.',
  },
  ...legalPages,
];
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

export function createPublicRouter(records: readonly BlogPost[] = blogPosts) {
  const publicRouter = Router();
  const registry = createBlogRegistry(records);
  const featured = featuredBlogSlugs.flatMap((slug) => {
    const post = registry.find(slug);
    return post ? [post] : [];
  });
  const displayPosts = [
    ...featured,
    ...registry.published.filter((post) => !featuredBlogSlugs.includes(post.slug)),
  ];
  const blogPages = [
    blogPage,
    ...registry.published.map((post) => ({
      path: '/blog/' + post.slug,
      title: post.seoTitle,
      description: post.description,
    })),
  ];
  const allPages = [...pages, ...blogPages];
  const metadataPages = [
    ...pages.map((page) => ({
      ...page,
      title: page.path === '/' ? page.title : `${page.title} | TikSaveMp4`,
    })),
    ...blogPages,
  ];
  for (const key of ['title', 'description'] as const) {
    if (new Set(metadataPages.map((page) => page[key])).size !== metadataPages.length)
      throw new Error('Public SEO metadata must be unique.');
  }
  const sitemapPaths = allPages.map((page) => page.path);
  publicRouter.use((request, response, next) => {
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(request.path);
    } catch {
      next();
      return;
    }
    const publicPath = allPages.find(
      (page) =>
        page.path.toLowerCase() === decodedPath.toLowerCase().replace(/\/$/, '') ||
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
      // Public pages have no query-driven content. Ignore every parameter, keep a
      // clean canonical and let crawlers read noindex; never reflect query values.
      const hasQuery = request.originalUrl.includes('?');
      if (env.GA_MEASUREMENT_ID)
        analyticsCsp(request, response, () => {
          /* CSP only; rendering continues below. */
        });
      if (hasQuery) response.setHeader('X-Robots-Tag', 'noindex, follow');
      response.render(page.path === '/' ? 'index' : 'legal', {
        ...mockData,
        latestPosts: displayPosts.slice(0, 3),
        blogDate,
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
            ? serializeJsonLd([
                webApplication(env.PUBLIC_BASE_URL),
                faqPage(mockData.faqs),
              ])
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

  publicRouter.get(['/blog', '/blog/:slug'], (request, response, next) => {
    const slug = request.params.slug;
    const parsed = blogSlugSchema.safeParse(slug);
    const post =
      slug === undefined
        ? undefined
        : parsed.success
          ? registry.find(parsed.data)
          : undefined;
    if (slug !== undefined && !post) {
      next();
      return;
    }
    const page = post
      ? {
          path: '/blog/' + post.slug,
          title: post.seoTitle,
          description: post.description,
        }
      : blogPage;
    const hasQuery = request.originalUrl.includes('?');
    if (hasQuery) response.setHeader('X-Robots-Tag', 'noindex, follow');
    if (env.GA_MEASUREMENT_ID)
      analyticsCsp(request, response, () => {
        /* CSP only; rendering continues below. */
      });
    response.render(post ? 'blog-article' : 'blog', {
      page,
      post,
      posts: displayPosts,
      blogDate,
      relatedPosts: post
        ? registry.published.filter((item) => post.relatedSlugs.includes(item.slug))
        : [],
      structuredData: serializeJsonLd(
        blogStructuredData(env.PUBLIC_BASE_URL, displayPosts, post),
      ),
      analytics: env.GA_MEASUREMENT_ID
        ? {
            measurementId: env.GA_MEASUREMENT_ID,
            pageLocation: env.PUBLIC_BASE_URL + page.path,
            pageTitle: page.title,
          }
        : null,
      seo: {
        title: page.title,
        description: page.description,
        canonical: env.PUBLIC_BASE_URL + page.path,
        robots: hasQuery ? 'noindex, follow' : 'index, follow',
        image:
          env.PUBLIC_BASE_URL +
          (post?.cover?.src ?? '/assets/og/tiksavemp4-social-card.jpg'),
        imageWidth: post?.cover?.width ?? 1200,
        imageHeight: post?.cover?.height ?? 630,
        imageAlt:
          post?.cover?.alt ??
          'TikSaveMp4: public TikTok videos with available MP4 and MP3 options',
        imageType: post?.cover ? 'image/webp' : 'image/jpeg',
        ogType: post ? 'article' : 'website',
        publishedAt: post?.publishedAt,
        modifiedAt: post?.modifiedAt,
      },
    });
  });

  publicRouter.get('/robots.txt', (_request, response) => {
    response
      .type('text/plain')
      .send(
        [
          'User-agent: *',
          'Allow: /',
          'Allow: /assets/',
          'Disallow: /api/',
          'Disallow: /analyze',
          'Disallow: /health',
          'Disallow: /ready',
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
            .map(
              (path) => `<url><loc>${escapeXml(env.PUBLIC_BASE_URL + path)}</loc></url>`,
            )
            .join('') +
          '</urlset>',
      );
  });
  return publicRouter;
}
