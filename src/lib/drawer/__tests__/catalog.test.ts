import { describe, expect, it, vi } from 'vitest'
import type { Page, Post } from '@/lib/content/types'
import { buildDrawerCatalog, getDrawerCatalog } from '@/lib/drawer/catalog'
import { selectDrawer } from '@/lib/drawer/selection'

function post(overrides: Partial<Post> = {}): Post {
  return {
    slug: 'an-essay',
    newsletter: 'workshop',
    frontmatter: {
      title: 'An essay',
      publishedAt: '2020-06-07',
      featured: false,
      draft: false,
    },
    content: 'Essay body.',
    excerpt: 'Essay excerpt.',
    ...overrides,
  } as Post
}

function page(slug: string, content: string, draft = false): Page {
  return {
    slug,
    frontmatter: {
      title: slug,
      featured: false,
      draft,
    },
    content,
  }
}

describe('buildDrawerCatalog', () => {
  it('builds all five collections from published repository-shaped content', () => {
    const catalog = buildDrawerCatalog(
      [
        post(),
        post({
          slug: 'a-photo',
          newsletter: 'tidbits',
          frontmatter: {
            title: 'A photograph',
            publishedAt: '2026-09-01',
            coverImage: '/images/a-photo.jpg',
            coverImageAlt: 'A quiet street',
            featured: false,
            draft: false,
          },
        }),
      ],
      [
        page(
          'diction',
          '- **Palimpsest** — something bearing traces of an earlier form. [Wikipedia](https://example.com)'
        ),
        page(
          'contraptions',
          "- **Binnacle** — a housing for a ship's compass.\n- **Epigraph** — a quotation. [Wikipedia](https://en.wikipedia.org/wiki/Epigraph_(literature))\n- **Manicule** — a pointing hand. [Wikipedia](https://en.wikipedia.org/wiki/Manicule) 👉🏻"
        ),
        page(
          'blogroll',
          '- [Stratechery](https://stratechery.com)\n- [Cal Newport](https://calnewport.com)\n- [Craig Mod](https://craigmod.com) — Essays and newsletters'
        ),
      ]
    )

    expect(catalog.collections.writing).toHaveLength(1)
    expect(catalog.collections.photograph[0]).toMatchObject({
      title: 'A photograph',
      image: { alt: 'A quiet street' },
    })
    expect(catalog.collections.diction[0]).toMatchObject({
      title: 'Palimpsest',
      description: 'something bearing traces of an earlier form.',
    })
    expect(catalog.collections.contraption[0]?.title).toBe('Binnacle')
    expect(catalog.collections.contraption[1]).toMatchObject({
      title: 'Epigraph',
      description: 'a quotation.',
    })
    expect(catalog.collections.contraption[2]).toMatchObject({
      title: 'Manicule',
      description: 'a pointing hand. 👉🏻',
    })
    expect(catalog.collections.blogroll).toHaveLength(3)
    expect(catalog.collections.blogroll[1]).toMatchObject({
      title: 'Craig Mod',
      href: 'https://craigmod.com',
      external: true,
    })
    expect(catalog.earliestDate).toBe('2020-06-07')
  })

  it('filters drafts and Stargazing at the catalog boundary', () => {
    const catalog = buildDrawerCatalog(
      [
        post({ slug: 'stargazing' }),
        post({
          slug: 'draft-entry',
          frontmatter: {
            title: 'Draft entry',
            publishedAt: '2025-01-01',
            featured: false,
            draft: true,
          },
        }),
      ],
      [
        page('diction', '- **Hidden** — Draft word.', true),
        page('contraptions', ''),
        page('blogroll', ''),
      ]
    )

    expect(catalog.collections.writing).toEqual([])
    expect(catalog.collections.diction).toEqual([])
    expect(catalog.earliestDate).toBeNull()
  })

  it('keeps the newest writing out of the older archive compartment', () => {
    const posts = Array.from({ length: 10 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0')
      return post({
        slug: `essay-${day}`,
        frontmatter: {
          title: `Essay ${day}`,
          publishedAt: `2026-01-${day}`,
          featured: false,
          draft: false,
        },
      })
    })
    const catalog = buildDrawerCatalog(posts, [])

    expect(
      catalog.collections.writing.map((candidate) => candidate.title)
    ).toEqual(['Essay 01', 'Essay 02'])
  })

  it('builds the real catalog without a network request', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    try {
      const catalog = getDrawerCatalog()
      const selection = selectDrawer(catalog, '2026-09-06')

      expect(fetch).not.toHaveBeenCalled()
      expect(selection.items).toHaveLength(5)
      expect(selection.items.every((candidate) => !candidate.fallback)).toBe(
        true
      )
      expect(
        selection.items.some((candidate) => candidate.href === '/stargazing')
      ).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
