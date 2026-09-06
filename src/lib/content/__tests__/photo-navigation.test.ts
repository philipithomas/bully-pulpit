import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPostsByNewsletter } from '@/lib/content/loader'
import {
  getPhotoNavigation,
  getPhotoPosts,
} from '@/lib/content/photo-navigation'
import type { Newsletter, Post } from '@/lib/content/types'

vi.mock('@/lib/content/loader', () => ({
  getPostsByNewsletter: vi.fn(),
}))

function photo(
  slug: string,
  publishedAt = '2026-09-01',
  newsletter: Newsletter = 'tidbits',
  sequence = 0
): Post {
  return {
    slug,
    newsletter,
    frontmatter: {
      title: slug,
      publishedAt,
      sequence,
      coverImage: `/images/covers/${slug}.jpg`,
      featured: false,
      draft: false,
    },
    coverDimensions: { width: 1200, height: 800 },
    content: '',
    excerpt: '',
  }
}

const newest = photo('newest', '2026-09-03')
const middle = photo('middle', '2026-09-02')
const oldest = photo('oldest', '2026-09-01')

beforeEach(() => {
  vi.mocked(getPostsByNewsletter).mockReset()
  vi.mocked(getPostsByNewsletter).mockReturnValue([newest, middle, oldest])
})

describe('circular photo navigation', () => {
  it('wraps in both directions at the collection endpoints', () => {
    expect(getPhotoNavigation(newest)).toEqual({
      newer: oldest,
      older: middle,
      total: 3,
      index: 0,
    })
    expect(getPhotoNavigation(oldest)).toEqual({
      newer: middle,
      older: newest,
      total: 3,
      index: 2,
    })
  })

  it('preserves the newest-first gallery order including same-day sequence', () => {
    const first = photo('first', '2026-09-01', 'tsundoku', 1)
    const second = photo('second', '2026-09-01', 'tsundoku', 2)
    const third = photo('third', '2026-09-01', 'tsundoku', 3)
    vi.mocked(getPostsByNewsletter).mockReturnValue([first, third, second])

    expect(getPhotoNavigation(second)).toEqual({
      newer: third,
      older: first,
      total: 3,
      index: 1,
    })
    expect(getPostsByNewsletter).toHaveBeenCalledWith('tsundoku')
  })

  it('excludes other newsletters, drafts, and missing or unusable covers', () => {
    const draft = photo('draft')
    draft.frontmatter.draft = true
    const missing = photo('missing')
    missing.frontmatter.coverImage = undefined
    const undimensioned = photo('undimensioned')
    undimensioned.coverDimensions = undefined
    const invalid = photo('invalid')
    invalid.coverDimensions = { width: 0, height: 800 }
    const unpublished = photo('unpublished')
    unpublished.frontmatter.publishedAt = ''
    vi.mocked(getPostsByNewsletter).mockReturnValue([
      newest,
      photo('essay', '2026-09-02', 'contraption'),
      draft,
      missing,
      undimensioned,
      invalid,
      unpublished,
      oldest,
    ])

    expect(getPhotoPosts('tidbits')).toEqual([newest, oldest])
    expect(getPhotoNavigation(newest)).toEqual({
      newer: oldest,
      older: oldest,
      total: 2,
      index: 0,
    })
    expect(getPhotoNavigation(missing)).toEqual({
      newer: null,
      older: null,
      total: 0,
      index: -1,
    })
  })

  it('does not navigate a one-photo collection to itself', () => {
    vi.mocked(getPostsByNewsletter).mockReturnValue([newest])
    expect(getPhotoNavigation(newest)).toEqual({
      newer: null,
      older: null,
      total: 1,
      index: 0,
    })
  })

  it.each([
    'contraption',
    'postcard',
    'workshop',
  ] as const)('never opts %s into photo navigation', (newsletter) => {
    expect(
      getPhotoNavigation(photo('essay', '2026-09-01', newsletter))
    ).toEqual({
      newer: null,
      older: null,
      total: 0,
      index: -1,
    })
    expect(getPostsByNewsletter).not.toHaveBeenCalled()
  })
})
