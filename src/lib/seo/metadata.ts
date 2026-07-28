import type { Metadata } from 'next'
import { siteConfig } from '@/lib/config'
import type { Newsletter } from '@/lib/content/types'
import { feedDiscovery } from '@/lib/feeds/discovery'

export const DEFAULT_SOCIAL_IMAGE = {
  url: siteConfig.image,
  width: 1200,
  height: 630,
  alt: 'PIT monogram',
  type: 'image/png',
} as const

interface PublicPageMetadataOptions {
  path: '/' | `/${string}`
  title: string
  description: string
  newsletter?: Newsletter
}

/**
 * Complete metadata for a public App Router page.
 *
 * Next.js shallowly merges nested metadata, so setting only a page title does
 * not update the root Open Graph or Twitter object. Keep every page-facing
 * social field together here so link previews cannot silently identify a
 * child page as the homepage.
 */
export function createPublicPageMetadata({
  path,
  title,
  description,
  newsletter,
}: PublicPageMetadataOptions): Metadata {
  const newsletterIcon = newsletter
    ? siteConfig.newsletters[newsletter].icon
    : null

  return {
    title,
    description,
    alternates: {
      canonical: path,
      types: feedDiscovery(newsletter),
    },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: path,
      siteName: siteConfig.title,
      title,
      description,
      // Newsletter segments provide colocated opengraph-image files. Omitting
      // this field lets Next.js attach those generated images; an explicit
      // fallback here would win instead.
      ...(!newsletter && { images: [DEFAULT_SOCIAL_IMAGE] }),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      // Newsletter segments likewise provide colocated twitter-image files.
      ...(!newsletter && { images: [DEFAULT_SOCIAL_IMAGE] }),
    },
    ...(newsletterIcon
      ? {
          icons: {
            icon: [{ url: newsletterIcon, type: 'image/svg+xml' }],
            apple: '/apple-touch-icon.png',
          },
        }
      : {}),
  }
}
