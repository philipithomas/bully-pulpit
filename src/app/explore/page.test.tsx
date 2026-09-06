import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ExplorePage from '@/app/explore/page'
import { getExploreGroups } from '@/lib/discovery/explore'

describe('Explore page', () => {
  it('renders the complete archive map as useful server HTML', () => {
    const html = renderToStaticMarkup(<ExplorePage />)
    const groups = getExploreGroups()

    expect(html).toContain('<h1')
    expect(html).toContain('>Explore</h1>')
    expect(html).toContain('href="/sitemap"')

    for (const group of groups) {
      expect(html).toContain(`aria-labelledby="explore-${group.id}"`)
      for (const destination of group.destinations) {
        expect(html).toContain(`href="${destination.href}"`)
        expect(html).toContain(
          `aria-describedby="explore-${destination.id}-description"`
        )
        expect(html).toContain(destination.title)
      }
    }
  })

  it('keeps destination links in the typed keyboard and reading order', () => {
    const html = renderToStaticMarkup(<ExplorePage />)
    const hrefs = getExploreGroups().flatMap((group) =>
      group.destinations.map((destination) => destination.href)
    )
    const positions = hrefs.map((href) => html.indexOf(`href="${href}"`))

    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })
})
