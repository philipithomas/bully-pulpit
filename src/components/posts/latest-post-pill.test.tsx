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

  it('skips both photo newsletters to show the newest writing', () => {
    vi.mocked(getAllPosts).mockReturnValue([
      post('latest-photo', 'tidbits'),
      post('travel-photo', 'tsundoku'),
      post('latest-writing', 'postcard'),
      post('older-writing', 'contraption'),
    ])

    const html = renderToStaticMarkup(<LatestPostPill />)
    expect(html).toContain('href="/latest-writing"')
    expect(html).not.toContain('latest-photo')
    expect(html).not.toContain('travel-photo')
    expect(html).not.toContain('older-writing')
  })

  it('keeps Workshop writing eligible', () => {
    vi.mocked(getAllPosts).mockReturnValue([
      post('work-in-progress', 'workshop'),
    ])
    expect(renderToStaticMarkup(<LatestPostPill />)).toContain(
      'href="/work-in-progress"'
    )
  })

  it('renders nothing if only photographs are available', () => {
    vi.mocked(getAllPosts).mockReturnValue([post('photo', 'tidbits')])
    expect(renderToStaticMarkup(<LatestPostPill />)).toBe('')
  })
})
