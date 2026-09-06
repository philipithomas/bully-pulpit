import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ExploreNavigationLink } from '@/components/layout/explore-navigation-link'

describe('Explore navigation link', () => {
  it('uses a visible text label and exposes the active page', () => {
    const active = renderToStaticMarkup(<ExploreNavigationLink active />)
    const inactive = renderToStaticMarkup(
      <ExploreNavigationLink active={false} />
    )

    expect(active).toContain('href="/explore"')
    expect(active).toContain('aria-current="page"')
    expect(active).toContain('>Explore</a>')
    expect(inactive).not.toContain('aria-current')
  })
})
