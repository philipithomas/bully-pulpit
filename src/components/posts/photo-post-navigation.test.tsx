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
})
