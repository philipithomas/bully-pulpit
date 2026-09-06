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
        expect(html).toContain(`data-explore-destination="${destination.id}"`)
        if (destination.kind === 'link') {
          expect(html).toContain(`href="${destination.href}"`)
        }
        expect(html).toContain(destination.title)
      }
    }
    expect(html).toContain('<button type="button"')
    expect(html).not.toContain('aria-describedby')
    expect(html).not.toContain('border-t')
    expect(html).not.toContain('divide-y')
    expect(html).not.toContain('uppercase')
  })

  it('keeps destination links in the typed keyboard and reading order', () => {
    const html = renderToStaticMarkup(<ExplorePage />)
    const destinationIds = getExploreGroups().flatMap((group) =>
      group.destinations.map((destination) => destination.id)
    )
    const positions = destinationIds.map((id) =>
      html.indexOf(`data-explore-destination="${id}"`)
    )

    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })
})
