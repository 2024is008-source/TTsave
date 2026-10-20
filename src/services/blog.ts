import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const blogSlugSchema = z
  .string()
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = z.string().trim().min(1).max(10000);
// Inline runs preserve their separating spaces around links.
const inlineText = z
  .string()
  .min(1)
  .max(10000)
  .refine((value) => value.trim().length > 0);
const inline = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: inlineText }).strict(),
  z
    .object({
      type: z.literal('link'),
      text,
      href: z
        .string()
        .min(1)
        .max(250)
        .regex(/^(?:\/(?!\/)[a-z0-9/-]*)?(?:#[a-z0-9-]+)?$/),
    })
    .strict(),
]);
const runs = z.array(inline).min(1).max(100);
export const blogPostSchema = z
  .object({
    slug: blogSlugSchema,
    status: z.enum(['draft', 'published']),
    seoTitle: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(320),
    title: z.string().trim().min(1).max(180),
    excerpt: z.string().trim().min(1).max(400),
    category: z.string().trim().min(1).max(60),
    publishedAt: z.iso.datetime({ offset: true }),
    modifiedAt: z.iso.datetime({ offset: true }).optional(),
    author: z
      .object({ name: z.string().trim().min(1).max(100) })
      .strict()
      .optional(),
    cover: z
      .object({
        src: z.string().regex(/^\/assets\/images\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.webp$/),
        alt: z.string().trim().min(1).max(240),
        width: z.number().int().positive().max(8000),
        height: z.number().int().positive().max(8000),
      })
      .strict()
      .optional(),
    body: z
      .array(
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('paragraph'), content: runs }).strict(),
          z
            .object({
              type: z.literal('heading'),
              level: z.union([z.literal(2), z.literal(3)]),
              id: blogSlugSchema,
              text,
            })
            .strict(),
          z
            .object({
              type: z.literal('list'),
              ordered: z.boolean(),
              items: z.array(runs).min(1).max(100),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(200),
    relatedSlugs: z.array(blogSlugSchema).max(3).default([]),
  })
  .strict()
  .superRefine((post, context) => {
    if (post.modifiedAt && Date.parse(post.modifiedAt) < Date.parse(post.publishedAt))
      context.addIssue({
        code: 'custom',
        message: 'Modification must not precede publication.',
      });
    if (
      post.status === 'published' &&
      post.modifiedAt &&
      Date.parse(post.modifiedAt) > Date.now()
    )
      context.addIssue({
        code: 'custom',
        message: 'Modification cannot be in the future.',
      });
    if (post.status === 'published' && Date.parse(post.publishedAt) > Date.now())
      context.addIssue({
        code: 'custom',
        message: 'Future-dated posts must remain drafts.',
      });
    const headings = post.body.filter((block) => block.type === 'heading');
    if (new Set(headings.map((block) => block.id)).size !== headings.length)
      context.addIssue({ code: 'custom', message: 'Heading IDs must be unique.' });
    if (
      headings.some((block) =>
        ['main', 'mobile-nav', 'header-start-btn', 'analytics-init'].includes(block.id),
      )
    )
      context.addIssue({
        code: 'custom',
        message: 'Heading IDs must not shadow layout IDs.',
      });
    let hasH2 = false;
    for (const block of headings) {
      if (block.level === 2) hasH2 = true;
      else if (!hasH2)
        context.addIssue({ code: 'custom', message: 'H3 requires a preceding H2.' });
    }
  });
export type BlogPost = z.input<typeof blogPostSchema>;
export type PublishedPost = z.output<typeof blogPostSchema>;
export const blogPage = {
  path: '/blog',
  title: 'TikTok Download Guides & Tutorials | TikSaveMp4',
  description:
    'Practical guides to saving supported public TikTok videos as MP4, converting available audio to MP3, and downloading photos responsibly.',
};
const publicTargets = [
  '/',
  '/blog',
  '/privacy',
  '/terms',
  '/contact',
  '/copyright',
  '/responsible-use',
];

export function createBlogRegistry(records: readonly BlogPost[]) {
  const all = z.array(blogPostSchema).parse(records);
  if (new Set(all.map((post) => post.slug)).size !== all.length)
    throw new Error('Duplicate blog slug.');
  const published = all
    .filter((post) => post.status === 'published')
    .sort(
      (a, b) =>
        Date.parse(b.publishedAt) - Date.parse(a.publishedAt) ||
        a.slug.localeCompare(b.slug),
    );
  for (const key of ['seoTitle', 'description'] as const)
    if (new Set(published.map((post) => post[key])).size !== published.length)
      throw new Error('Published blog metadata must be unique.');
  const targets = new Set([
    ...publicTargets,
    ...published.map((post) => '/blog/' + post.slug),
  ]);
  for (const post of published) {
    if (
      post.cover &&
      !existsSync(
        path.join(
          fileURLToPath(new URL('../../public/', import.meta.url)),
          post.cover.src,
        ),
      )
    )
      throw new Error('Missing blog cover image.');
    if (
      new Set(post.relatedSlugs).size !== post.relatedSlugs.length ||
      post.relatedSlugs.some(
        (slug) => slug === post.slug || !published.some((item) => item.slug === slug),
      )
    )
      throw new Error('Related posts must reference other published posts.');
    for (const block of post.body) {
      const content =
        block.type === 'paragraph'
          ? block.content
          : block.type === 'list'
            ? block.items.flat()
            : [];
      for (const run of content) {
        if (run.type !== 'link') continue;
        const [target, fragment] = run.href.split('#');
        if (target && !targets.has(target))
          throw new Error('Unknown internal blog link.');
        if (fragment) {
          const targetPath = target?.length ? target : '/blog/' + post.slug;
          const targetPost = published.find(
            (item) => '/blog/' + item.slug === targetPath,
          );
          const ids = targetPost
            ? targetPost.body
                .filter((item) => item.type === 'heading')
                .map((item) => item.id)
            : targetPath === '/'
              ? ['how-it-works', 'features', 'faq', 'downloader']
              : [];
          if (!['main', ...ids].includes(fragment))
            throw new Error('Unknown heading link.');
        }
      }
    }
  }
  return {
    published,
    find: (slug: string) => published.find((post) => post.slug === slug),
  };
}

export function blogStructuredData(
  base: string,
  posts: readonly PublishedPost[],
  post?: PublishedPost,
) {
  const url = base + (post ? '/blog/' + post.slug : '/blog');
  const crumbs = [
    { name: 'Home', item: base + '/' },
    { name: 'Blog', item: base + '/blog' },
    ...(post ? [{ name: post.title, item: url }] : []),
  ];
  return [
    post
      ? {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.description,
          url,
          mainEntityOfPage: url,
          ...(post.cover ? { image: base + post.cover.src } : {}),
          datePublished: post.publishedAt,
          ...(post.modifiedAt ? { dateModified: post.modifiedAt } : {}),
          ...(post.author
            ? { author: { '@type': 'Person', name: post.author.name } }
            : {}),
          articleSection: post.category,
          inLanguage: 'en-US',
        }
      : {
          '@context': 'https://schema.org',
          '@type': 'Blog',
          name: 'TikTok Download Guides & Tutorials',
          description: blogPage.description,
          url,
          blogPost: posts.map((item) => ({
            '@type': 'BlogPosting',
            headline: item.title,
            url: base + '/blog/' + item.slug,
            datePublished: item.publishedAt,
          })),
        },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        ...item,
      })),
    },
  ];
}

export function blogDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(value),
  );
}
