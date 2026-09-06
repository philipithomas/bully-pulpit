import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TsundokuPage from '@/app/tsundoku/page'
import { getPostsByNewsletter } from '@/lib/content/loader'

function tagForCover(tags: string[], cover: string): string | undefined {
  return tags.find((tag) => tag.includes(encodeURIComponent(cover)))
}

describe('TsundokuPage image loading', () => {
  it('opts every gallery photo into the Tsundoku viewer collection', async () => {
    const html = renderToStaticMarkup(await TsundokuPage())
    const photoButtons =
      html.match(/<button\b[^>]*data-zoomable=""[^>]*>/g) ?? []

    expect(photoButtons.length).toBeGreaterThan(1)
    for (const button of photoButtons) {
      expect(button).toContain('data-zoom-caption-collection="tsundoku"')
      expect(button).toContain('data-zoom-group="tsundoku"')
    }
  })

  it('gives only the first photo an LCP preload', async () => {
    const html = renderToStaticMarkup(await TsundokuPage())
    const covers = getPostsByNewsletter('tsundoku')
      .slice(0, 3)
      .map((post) => post.frontmatter.coverImage)
      .filter((cover): cover is string => Boolean(cover))
    const preloadTags = html.match(/<link\b[^>]*rel="preload"[^>]*>/g) ?? []

    expect(covers).toHaveLength(3)
    expect(tagForCover(preloadTags, covers[0])).toContain(
      'fetchPriority="high"'
    )

    for (const cover of covers.slice(1)) {
      expect(tagForCover(preloadTags, cover)).toBeUndefined()
    }
  })
})
