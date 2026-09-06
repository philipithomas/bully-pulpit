import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/posts/route'
import { getAllPosts, getPostsByNewsletter } from '@/lib/content/loader'
import type { Newsletter, Post } from '@/lib/content/types'

vi.mock('@/lib/content/loader', () => ({
  getAllPosts: vi.fn(),
  getPostsByNewsletter: vi.fn(),
}))

function photo(
  slug: string,
  newsletter: Newsletter = 'tidbits',
  date = '2026-09-01'
): Post {
  return {
    slug,
    newsletter,
    frontmatter: {
      title: slug,
      publishedAt: date,
      coverImage: `/images/covers/${slug}.jpg`,
      coverImageAlt: slug,
      featured: false,
      draft: false,
    },
    coverDimensions: { width: 1200, height: 800 },
    content: 'A photo caption.',
    excerpt: 'An excerpt.',
  }
}

beforeEach(() => {
  vi.mocked(getAllPosts).mockReset()
  vi.mocked(getPostsByNewsletter).mockReset()
})

describe('posts gallery API', () => {
  it.each([
    'tidbits',
    'tsundoku',
  ] as const)('returns the complete ordered %s photo collection independently of list pagination', async (newsletter) => {
    vi.mocked(getPostsByNewsletter).mockReturnValue([
      photo('older', newsletter, '2026-09-01'),
      photo('newer', newsletter, '2026-09-02'),
    ])
    const response = await GET(
      new NextRequest(
        `https://www.philipithomas.com/api/posts?newsletter=${newsletter}&view=gallery&page=2&limit=1&skip=1`
      )
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=60, s-maxage=300'
    )
    const data = await response.json()
    expect(
      data.photos.map(
        (item: { caption: { href: string } }) => item.caption.href
      )
    ).toEqual(['/newer', '/older'])
    expect(
      data.photos.every(
        (item: { caption: { collection: string } }) =>
          item.caption.collection === newsletter
      )
    ).toBe(true)
    expect(data).not.toHaveProperty('posts')
    expect(data).not.toHaveProperty('meta')
    expect(getAllPosts).not.toHaveBeenCalled()
  })

  it.each([
    'contraption',
    'workshop',
    'postcard',
    'sundoku',
    '',
    'unknown',
  ])('rejects gallery requests for %s', async (newsletter) => {
    const response = await GET(
      new NextRequest(
        `https://www.philipithomas.com/api/posts?newsletter=${newsletter}&view=gallery`
      )
    )
    expect(response.status).toBe(400)
    expect(getPostsByNewsletter).not.toHaveBeenCalled()
    expect(getAllPosts).not.toHaveBeenCalled()
  })

  it('filters unusable covers and out-of-collection posts exactly like direct-post navigation', async () => {
    const missingCover = photo('missing-cover')
    missingCover.frontmatter.coverImage = undefined
    const missingDimensions = photo('missing-dimensions')
    missingDimensions.coverDimensions = undefined
    const invalidDimensions = photo('invalid-dimensions')
    invalidDimensions.coverDimensions = { width: 0, height: 800 }
    const draft = photo('draft')
    draft.frontmatter.draft = true
    vi.mocked(getPostsByNewsletter).mockReturnValue([
      photo('visible'),
      missingCover,
      missingDimensions,
      invalidDimensions,
      draft,
      photo('essay', 'contraption'),
    ])
    const response = await GET(
      new NextRequest(
        'https://www.philipithomas.com/api/posts?newsletter=tidbits&view=gallery'
      )
    )
    const data = await response.json()
    expect(
      data.photos.map(
        (item: { caption: { href: string } }) => item.caption.href
      )
    ).toEqual(['/visible'])
  })

  it('preserves the existing paginated post response for ordinary requests', async () => {
    vi.mocked(getPostsByNewsletter).mockReturnValue([
      photo('newer', 'contraption'),
      photo('older', 'contraption'),
    ])
    const response = await GET(
      new NextRequest(
        'https://www.philipithomas.com/api/posts?newsletter=contraption&page=2&limit=1'
      )
    )
    const data = await response.json()
    expect(data.posts.map((post: { slug: string }) => post.slug)).toEqual([
      'older',
    ])
    expect(data.meta).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 })
    expect(data).not.toHaveProperty('photos')
  })
})
