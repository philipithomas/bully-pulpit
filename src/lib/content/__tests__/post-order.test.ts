import { describe, expect, it } from 'vitest'
import { comparePostsNewestFirst } from '@/lib/content/post-order'
import type { Newsletter, Post } from '@/lib/content/types'

function post(
  newsletter: Newsletter,
  slug: string,
  publishedAt: string,
  sequence?: number
): Post {
  return {
    slug,
    newsletter,
    frontmatter: {
      title: slug,
      publishedAt,
      featured: false,
      draft: false,
      ...(sequence === undefined ? {} : { sequence }),
    },
    content: '',
    excerpt: '',
  }
}

describe('comparePostsNewestFirst', () => {
  it('uses editorial newsletter priority for posts on the same day', () => {
    const posts = [
      post('tsundoku', 'tsundoku', '2026-07-22', 99),
      post('tidbits', 'tidbits', '2026-07-22'),
      post('workshop', 'workshop', '2026-07-22'),
      post('postcard', 'postcard', '2026-07-22'),
      post('contraption', 'contraption', '2026-07-22'),
    ]

    expect(
      posts.sort(comparePostsNewestFirst).map((item) => item.newsletter)
    ).toEqual(['contraption', 'postcard', 'workshop', 'tidbits', 'tsundoku'])
  })

  it('always sorts a newer date before newsletter priority', () => {
    const posts = [
      post('contraption', 'older-essay', '2026-07-22'),
      post('tsundoku', 'newer-photo', '2026-07-23'),
    ]

    expect(
      posts.sort(comparePostsNewestFirst).map((item) => item.slug)
    ).toEqual(['newer-photo', 'older-essay'])
  })

  it('uses sequence within a newsletter on the same day', () => {
    const posts = [
      post('tsundoku', 'first', '2026-07-22', 1),
      post('tsundoku', 'third', '2026-07-22', 3),
      post('tsundoku', 'second', '2026-07-22', 2),
    ]

    expect(
      posts.sort(comparePostsNewestFirst).map((item) => item.slug)
    ).toEqual(['third', 'second', 'first'])
  })

  it('falls back to slug order for an exact publication tie', () => {
    const posts = [
      post('workshop', 'zebra', '2026-07-22'),
      post('workshop', 'alpha', '2026-07-22'),
    ]

    expect(
      posts.sort(comparePostsNewestFirst).map((item) => item.slug)
    ).toEqual(['alpha', 'zebra'])
  })
})
