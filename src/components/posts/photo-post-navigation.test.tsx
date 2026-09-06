import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PhotoPostNavigation } from '@/components/posts/photo-post-navigation'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { getPhotoNavigation } from '@/lib/content/photo-navigation'

describe('photo post navigation links', () => {
  it.each([
    'tidbits',
    'tsundoku',
  ] as const)('puts Newer on the left and Older on the right for %s, with circular links', (newsletter) => {
    const posts = getPostsByNewsletter(newsletter)
    const navigation = getPhotoNavigation(posts[0])
    const html = renderToStaticMarkup(<PhotoPostNavigation {...navigation} />)

    expect(html).toContain('aria-label="Photo navigation"')
    expect(html.indexOf('Newer')).toBeLessThan(html.indexOf('Older'))
    expect(html).toContain(`href="/${posts.at(-1)?.slug}#photo"`)
    expect(html).toContain(`href="/${posts[1].slug}#photo"`)
    expect(html).toContain('data-cover-srcset=')
    expect(html).toContain('grid-cols-2')
  })

  it('renders no duplicate self-link for a one-photo collection', () => {
    expect(
      renderToStaticMarkup(<PhotoPostNavigation older={null} newer={null} />)
    ).toBe('')
  })

  it.each([
    '/evil.example/escape?next=elsewhere#fragment',
    'javascript:alert("photo")',
    'photo%2Freserved café',
  ])('keeps the reserved slug %s inside one same-origin path segment', (slug) => {
    const photo = { ...getPostsByNewsletter('tidbits')[0], slug }
    const html = renderToStaticMarkup(
      <PhotoPostNavigation older={photo} newer={photo} />
    )
    const hrefs = [...html.matchAll(/\bhref="([^"]*)"/g)].map(
      (match) => match[1]
    )

    expect(hrefs).toHaveLength(2)
    for (const href of hrefs) {
      expect(href).toBe(`/${encodeURIComponent(slug)}#photo`)
      const destination = new URL(href, 'https://www.philipithomas.com')
      expect(destination.origin).toBe('https://www.philipithomas.com')
      expect(destination.pathname.split('/')).toHaveLength(2)
      expect(decodeURIComponent(destination.pathname.slice(1))).toBe(slug)
      expect(destination.search).toBe('')
      expect(destination.hash).toBe('#photo')
    }
  })
})
