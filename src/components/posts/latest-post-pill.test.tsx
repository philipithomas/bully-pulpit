import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LatestPostPill } from '@/components/posts/latest-post-pill'
import { getAllPosts } from '@/lib/content/loader'
import type { Newsletter, Post } from '@/lib/content/types'

vi.mock('@/lib/content/loader', () => ({ getAllPosts: vi.fn() }))

function post(slug: string, newsletter: Newsletter): Post {
  return {
    slug,
    newsletter,
    frontmatter: { title: slug },
  } as Post
}

describe('homepage New pill', () => {
  beforeEach(() => vi.mocked(getAllPosts).mockReset())

  it.each([
    'contraption',
    'workshop',
    'postcard',
    'tidbits',
    'tsundoku',
  ] as const)('shows the newest post when it belongs to %s', (newsletter) => {
    vi.mocked(getAllPosts).mockReturnValue([
      post('latest-post', newsletter),
      post('travel-photo', 'tsundoku'),
      post('older-writing', 'contraption'),
    ])

    const html = renderToStaticMarkup(<LatestPostPill />)
    expect(html).toContain('href="/latest-post"')
    expect(html).not.toContain('travel-photo')
    expect(html).not.toContain('older-writing')
  })

  it('renders nothing if no posts are available', () => {
    vi.mocked(getAllPosts).mockReturnValue([])
    expect(renderToStaticMarkup(<LatestPostPill />)).toBe('')
  })
})
