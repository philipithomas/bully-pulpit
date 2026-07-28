import { describe, expect, it } from 'vitest'
import { siteConfig } from '@/lib/config'
import {
  createPublicPageMetadata,
  DEFAULT_SOCIAL_IMAGE,
} from '@/lib/seo/metadata'

describe('createPublicPageMetadata', () => {
  it('keeps browser, Open Graph, and Twitter identity page-specific', () => {
    const metadata = createPublicPageMetadata({
      path: '/photography',
      title: 'Photography',
      description: 'I take and edit all photos on the site.',
    })

    expect(metadata).toMatchObject({
      title: 'Photography',
      description: 'I take and edit all photos on the site.',
      alternates: { canonical: '/photography' },
      openGraph: {
        type: 'website',
        locale: 'en_US',
        url: '/photography',
        siteName: siteConfig.title,
        title: 'Photography',
        description: 'I take and edit all photos on the site.',
        images: [DEFAULT_SOCIAL_IMAGE],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Photography',
        description: 'I take and edit all photos on the site.',
        images: [DEFAULT_SOCIAL_IMAGE],
      },
    })
    expect(metadata.icons).toBeUndefined()
  })

  it('adds a newsletter favicon while retaining the PNG Apple touch icon', () => {
    const metadata = createPublicPageMetadata({
      path: '/tsundoku',
      title: 'Tsundoku',
      description: 'Pop-up photography newsletter.',
      newsletter: 'tsundoku',
    })

    expect(metadata.icons).toEqual({
      icon: [
        {
          url: siteConfig.newsletters.tsundoku.icon,
          type: 'image/svg+xml',
        },
      ],
      apple: '/apple-touch-icon.png',
    })
    expect(metadata.openGraph).not.toHaveProperty('images')
    expect(metadata.twitter).not.toHaveProperty('images')
  })
})
