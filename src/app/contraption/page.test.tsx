import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ContraptionPage from '@/app/contraption/page'
import { getPostsByNewsletter } from '@/lib/content/loader'

function tagForCover(tags: string[], cover: string): string | undefined {
  return tags.find((tag) => tag.includes(encodeURIComponent(cover)))
}

describe('ContraptionPage image loading', () => {
  it('preloads only the featured LCP cover', () => {
    const html = renderToStaticMarkup(<ContraptionPage />)
    const covers = getPostsByNewsletter('contraption')
      .slice(0, 3)
      .map((post) => post.frontmatter.coverImage)
      .filter((cover): cover is string => Boolean(cover))
    const preloadTags = html.match(/<link\b[^>]*rel="preload"[^>]*>/g) ?? []
    const imageTags = html.match(/<img\b[^>]*>/g) ?? []

    expect(covers).toHaveLength(3)
    expect(tagForCover(preloadTags, covers[0])).toContain(
      'fetchPriority="high"'
    )

    for (const cover of covers.slice(1)) {
      expect(tagForCover(preloadTags, cover)).toBeUndefined()
      expect(tagForCover(imageTags, cover)).toContain('loading="eager"')
      expect(tagForCover(imageTags, cover)).toContain('fetchPriority="low"')
    }
  })
})
