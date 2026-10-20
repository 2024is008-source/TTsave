import { describe, expect, it } from 'vitest';
import { blogPosts } from '../src/data/blog-posts.js';
import {
  blogDate,
  blogPostSchema,
  blogStructuredData,
  createBlogRegistry,
} from '../src/services/blog.js';
import { fixturePost } from './fixtures/blog.js';

describe('validated blog publishing registry', () => {
  it('publishes only the approved articles and sorts only reviewed published records', () => {
    expect(blogPosts.map((post) => post.slug)).toEqual([
      'how-to-convert-tiktok-to-mp4',
      'how-to-convert-tiktok-to-mp3',
      'how-to-download-tiktok-images',
      'how-to-download-tiktok-videos-on-pc',
    ]);
    const registry = createBlogRegistry([
      fixturePost('older'),
      fixturePost('newer', { publishedAt: '2024-02-01T12:00:00+02:00' }),
      fixturePost('draft', { status: 'draft' }),
    ]);
    expect(registry.published.map((post) => post.slug)).toEqual(['newer', 'older']);
    expect(registry.find('draft')).toBeUndefined();
    expect(blogDate('2024-01-01T09:00:00Z')).toBe('January 1, 2024');
  });
  it.each([
    { slug: '../unsafe' },
    { slug: 'Uppercase' },
    { slug: 'two--hyphens' },
    { publishedAt: '2024-02-31' },
    { publishedAt: '2999-01-01T00:00:00Z' },
    { modifiedAt: '2023-01-01T00:00:00Z' },
    { modifiedAt: '2999-01-01T00:00:00Z' },
    {
      cover: {
        src: 'https://example.org/cover.webp',
        alt: 'External',
        width: 10,
        height: 10,
      },
    },
    {
      cover: {
        src: '/assets/images/../secret.webp',
        alt: 'Unsafe',
        width: 10,
        height: 10,
      },
    },
    { body: [{ type: 'html', html: '<script>alert(1)</script>' }] },
    {
      body: [
        {
          type: 'paragraph',
          content: [{ type: 'link', href: 'javascript:alert(1)', text: 'Unsafe' }],
        },
      ],
    },
    { body: [{ type: 'heading', level: 3, id: 'skip', text: 'Skipped level' }] },
    { body: [{ type: 'heading', level: 2, id: 'main', text: 'Reserved ID' }] },
  ])('rejects unsafe or inconsistent content %j', (invalid) => {
    expect(blogPostSchema.safeParse({ ...fixturePost(), ...invalid }).success).toBe(
      false,
    );
  });
  it('rejects duplicate identities/metadata, missing assets, invalid related posts and broken links', () => {
    const cover = fixturePost().cover;
    if (!cover) throw new Error('Expected fixture cover');
    expect(() => createBlogRegistry([fixturePost(), fixturePost()])).toThrow('Duplicate');
    expect(() =>
      createBlogRegistry([
        fixturePost('one'),
        fixturePost('two', { seoTitle: fixturePost('one').seoTitle }),
      ]),
    ).toThrow('metadata');
    expect(() =>
      createBlogRegistry([
        fixturePost('one', {
          cover: {
            ...cover,
            src: '/assets/images/missing-test-cover.webp',
          },
        }),
      ]),
    ).toThrow('Missing');
    expect(() =>
      createBlogRegistry([
        fixturePost('one', { relatedSlugs: ['draft'] }),
        fixturePost('draft', { status: 'draft' }),
      ]),
    ).toThrow('Related');
    for (const href of ['/missing', '/blog/draft', '#missing', '/#missing']) {
      expect(() =>
        createBlogRegistry([
          fixturePost('one', {
            body: [
              { type: 'paragraph', content: [{ type: 'link', text: 'Link', href }] },
            ],
          }),
        ]),
      ).toThrow();
    }
  });
  it('uses recorded facts only in structured data', () => {
    const post = createBlogRegistry([fixturePost()]).published[0];
    expect(post).toBeDefined();
    const data = blogStructuredData('https://tiksavemp4.online', [], post);
    expect(data[0]).toMatchObject({
      '@type': 'BlogPosting',
      datePublished: '2024-01-01T09:00:00Z',
    });
    expect(data[0]).not.toHaveProperty('author');
    expect(data[0]).not.toHaveProperty('dateModified');
    expect(JSON.stringify(data)).not.toMatch(/aggregateRating|review|publisher|traffic/);
  });
  it('supports image-free posts without inventing an image in structured data', () => {
    const { cover: _cover, ...withoutCover } = fixturePost('image-free');
    expect(_cover).toBeDefined();
    const post = createBlogRegistry([withoutCover]).published[0];
    expect(post).toBeDefined();
    expect(post).not.toHaveProperty('cover');
    expect(
      blogStructuredData('https://tiksavemp4.online', [], post)[0],
    ).not.toHaveProperty('image');
  });
  it('rejects multiple fragment delimiters instead of accepting broken anchors', () => {
    expect(
      blogPostSchema.safeParse(
        fixturePost('bad-fragment', {
          body: [
            {
              type: 'paragraph',
              content: [{ type: 'link', text: 'Broken anchor', href: '/#faq#missing' }],
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });
});
