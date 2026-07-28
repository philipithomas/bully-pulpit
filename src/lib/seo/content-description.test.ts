import { describe, expect, it } from 'vitest'
import type { Page } from '@/lib/content/types'
import { contentDescription } from '@/lib/seo/content-description'

function page(overrides: Partial<Page> = {}): Page {
  return {
    slug: 'example',
    frontmatter: {
      title: 'Example',
      featured: false,
      draft: false,
    },
    content: 'A route-specific opening paragraph.',
    ...overrides,
  }
}

describe('contentDescription', () => {
  it('prefers the explicit frontmatter description', () => {
    expect(
      contentDescription(
        page({
          frontmatter: {
            title: 'Example',
            description: 'Hand-written description.',
            featured: false,
            draft: false,
          },
        })
      )
    ).toBe('Hand-written description.')
  })

  it('derives the same bounded route-specific excerpt used by metadata', () => {
    expect(contentDescription(page())).toBe(
      'A route-specific opening paragraph.'
    )
  })

  it('falls back to image alt or title when the body is empty', () => {
    expect(
      contentDescription(
        page({
          content: '',
          frontmatter: {
            title: 'Example',
            coverImageAlt: 'A useful image description',
            featured: false,
            draft: false,
          },
        })
      )
    ).toBe('A useful image description')
  })
})
