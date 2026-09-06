import { describe, expect, it, vi } from 'vitest'
import type { CollectionEntry } from '@/lib/collections'
import type { Post } from '@/lib/content/types'
import {
  buildHomeDrawer,
  getHomeDrawer,
  HOME_PHOTO_LIMIT,
  type HomeDrawerSources,
} from '@/lib/home/drawer'

const TODAY = new Date('2026-09-06T12:00:00Z')

function post(
  slug: string,
  publishedAt: string,
  overrides: Partial<Post> = {}
): Post {
  return {
    slug,
    newsletter: 'contraption',
    frontmatter: {
      title: slug,
      publishedAt,
      featured: false,
      draft: false,
    },
    content: 'The complete post should never enter the homepage payload.',
    excerpt: 'A short description.',
    ...overrides,
  }
}

function photograph(
  slug: string,
  publishedAt: string,
  overrides: Partial<Post> = {}
): Post {
  return post(slug, publishedAt, {
    newsletter: 'tidbits',
    frontmatter: {
      title: slug,
      publishedAt,
      coverImage: `/images/covers/tidbits/${slug}.jpg`,
      coverImageAlt: `Photograph ${slug}.`,
      featured: false,
      draft: false,
    },
    coverDimensions: { width: 1200, height: 800 },
    ...overrides,
  })
}

function entries(prefix: string): CollectionEntry[] {
  return Array.from({ length: 20 }, (_, index) => ({
    term: `${prefix} ${index}`,
    definition: `A definition for ${prefix} ${index}.`,
  }))
}

function sources(posts: Post[] = []): HomeDrawerSources {
  return { posts, diction: entries('Word'), contraptions: entries('Object') }
}

describe('homepage drawer', () => {
  it('stays deterministic within a UTC day and independent of source order', () => {
    const input = sources([
      photograph('latest', '2026-09-05'),
      photograph('older', '2024-04-01'),
      post('essay', '2023-02-01'),
    ])
    const expected = buildHomeDrawer(input, TODAY)
    const reversed = buildHomeDrawer(
      {
        posts: [...input.posts].reverse(),
        diction: [...input.diction].reverse(),
        contraptions: [...input.contraptions].reverse(),
      },
      new Date('2026-09-06T23:59:59Z')
    )
    expect(reversed).toEqual(expected)
    expect(
      buildHomeDrawer(input, new Date('2026-09-05T20:00:00-04:00'))
    ).toEqual(expected)
    const nextDay = buildHomeDrawer(input, new Date('2026-09-07T00:00:00Z'))
    expect(nextDay.date).toBe('2026-09-07')
    expect([nextDay.word, nextDay.contraption]).not.toEqual([
      expected.word,
      expected.contraption,
    ])
  })

  it('keeps only published photo newsletters with readable local covers', () => {
    const draft = photograph('draft', '2026-09-06')
    draft.frontmatter.draft = true
    const external = photograph('external', '2026-09-06')
    external.frontmatter.coverImage = 'https://example.com/photo.jpg'
    const traversing = photograph('traversing', '2026-09-06')
    traversing.frontmatter.coverImage = '/images/../private/photo.jpg'
    const ordinaryCover = photograph('essay-cover', '2026-09-06', {
      newsletter: 'workshop',
    })
    const newest = photograph('latest', '2026-09-06')
    const oldDuplicate = photograph('old-duplicate', '2026-01-01')
    oldDuplicate.frontmatter.coverImage = newest.frontmatter.coverImage
    const result = buildHomeDrawer(
      sources([
        newest,
        photograph('old-photo', '2020-01-01', { newsletter: 'tsundoku' }),
        photograph('future', '2026-09-07'),
        photograph('no-dimensions', '2026-09-06', {
          coverDimensions: undefined,
        }),
        photograph('zero-dimensions', '2026-09-06', {
          coverDimensions: { width: 0, height: 800 },
        }),
        photograph('invalid-date', '2026-02-30'),
        draft,
        external,
        traversing,
        ordinaryCover,
        oldDuplicate,
      ]),
      TODAY
    )
    expect(result.photos.map((photo) => photo.href)).toEqual([
      '/latest',
      '/old-photo',
    ])
    expect(result.photos[0]).toMatchObject({
      alt: 'Photograph latest.',
      width: 1200,
      height: 800,
      newsletter: 'tidbits',
    })
    expect(result.photos[1]?.newsletter).toBe('tsundoku')
  })

  it('bounds the payload while sampling across the entire photographic archive', () => {
    const photos = Array.from({ length: 100 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 0, 1 + index))
        .toISOString()
        .slice(0, 10)
      return photograph(`photo-${index}`, date)
    })
    const result = buildHomeDrawer(sources(photos), TODAY)
    expect(result.photos).toHaveLength(HOME_PHOTO_LIMIT)
    expect(result.photos[0]?.href).toBe('/photo-99')
    expect(new Set(result.photos.map((photo) => photo.src)).size).toBe(
      HOME_PHOTO_LIMIT
    )
    // The oldest chronological slice must be represented, not just recent work.
    expect(
      result.photos.some((photo) => photo.publishedAt <= '2026-01-09')
    ).toBe(true)
    expect(JSON.stringify(result)).not.toContain('The complete post')
    expect(JSON.stringify(result).length).toBeLessThan(8_000)
  })

  it('uses canonical collection anchors and does not repeat the same term', () => {
    const result = buildHomeDrawer(
      {
        posts: [],
        diction: [{ term: 'Nut graf', definition: 'A central point.' }],
        contraptions: [
          { term: 'Nut graf', definition: 'A central point.' },
          { term: 'Binnacle', definition: "A housing for a ship's compass." },
        ],
      },
      TODAY
    )
    expect(result.word?.href).toBe('/diction#nut-graf')
    expect(result.contraption).toMatchObject({
      title: 'Binnacle',
      href: '/contraptions#binnacle',
    })
  })

  it('labels an exact anniversary with the correct number of years', () => {
    const result = buildHomeDrawer(
      sources([
        post('new-writing', '2026-09-06'),
        post('anniversary', '2024-09-06'),
        post('nearby-date', '2025-09-05'),
        post('future-anniversary', '2027-09-06'),
        photograph('photo-anniversary', '2023-09-06'),
      ]),
      TODAY
    )
    expect(result.writing).toMatchObject({
      href: '/anniversary',
      publishedAt: '2024-09-06',
      label: 'On this day 2 years ago',
    })
    const oneYear = buildHomeDrawer(
      sources([post('one-year', '2025-09-06')]),
      TODAY
    )
    expect(oneYear.writing?.label).toBe('On this day 1 year ago')
  })

  it('uses an archive label when no exact anniversary exists, including leap years', () => {
    const posts = Array.from({ length: 12 }, (_, index) =>
      post(`essay-${index}`, `2026-01-${String(index + 1).padStart(2, '0')}`)
    )
    const result = buildHomeDrawer(sources(posts), TODAY)
    expect(result.writing?.label).toBe('From the archive')
    expect((result.writing?.publishedAt ?? '9999-12-31') <= '2026-01-04').toBe(
      true
    )

    const leapDay = buildHomeDrawer(
      sources([post('leap-day', '2024-02-29')]),
      new Date('2026-02-28T12:00:00Z')
    )
    expect(leapDay.writing?.label).toBe('From the archive')
  })

  it('keeps descriptions short and strips presentation markup', () => {
    const essay = post('essay', '2024-09-06')
    essay.frontmatter.description =
      '> A **quiet** [place](/archive) with <em>something</em> to read.'
    const result = buildHomeDrawer(sources([essay]), TODAY)
    expect(result.writing?.description).toBe(
      'A quiet place with something to read.'
    )
    essay.frontmatter.description = 'An especially long description. '.repeat(
      20
    )
    const truncated = buildHomeDrawer(sources([essay]), TODAY)
    expect(truncated.writing?.description.length).toBeLessThanOrEqual(180)
    expect(truncated.writing?.description.endsWith('…')).toBe(true)
  })

  it('returns quiet empty states when there is no eligible content', () => {
    const result = buildHomeDrawer(
      {
        posts: [post('future', '2027-09-06')],
        diction: [],
        contraptions: [],
      },
      TODAY
    )
    expect(result).toEqual({
      date: '2026-09-06',
      photos: [],
      word: null,
      contraption: null,
      writing: null,
    })
  })

  it('builds a small real payload without a network request', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    try {
      const result = getHomeDrawer(TODAY)
      expect(fetch).not.toHaveBeenCalled()
      expect(result.photos.length).toBeLessThanOrEqual(HOME_PHOTO_LIMIT)
      expect(result.photos.length).toBeGreaterThan(0)
      expect(result.word).not.toBeNull()
      expect(result.contraption).not.toBeNull()
      expect(result.writing).not.toBeNull()
      expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(12_000)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
