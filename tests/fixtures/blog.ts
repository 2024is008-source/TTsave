import type { BlogPost } from '../../src/services/blog.js';

// Test content only: never imported by the production content registry.
export function fixturePost(
  slug = 'test-video-guide',
  overrides: Partial<BlogPost> = {},
): BlogPost {
  return {
    slug,
    status: 'published',
    seoTitle: `Fixture ${slug} | TikSaveMp4`,
    description: `Test-only description for ${slug}.`,
    title: `Fixture ${slug}`,
    excerpt: 'Test-only guide excerpt.',
    category: 'Test category',
    publishedAt: '2024-01-01T09:00:00Z',
    cover: {
      src: '/assets/images/hero-video-poster.webp',
      alt: 'Adult creator standing on a beach at sunset',
      width: 1080,
      height: 1920,
    },
    body: [
      { type: 'heading', level: 2, id: 'first-step', text: 'First step' },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Read the ' },
          { type: 'link', href: '/#how-it-works', text: 'instructions' },
          { type: 'text', text: '.' },
        ],
      },
      { type: 'heading', level: 3, id: 'detail', text: 'More detail' },
      {
        type: 'list',
        ordered: true,
        items: [[{ type: 'text', text: 'Test instruction.' }]],
      },
    ],
    relatedSlugs: [],
    ...overrides,
  };
}
