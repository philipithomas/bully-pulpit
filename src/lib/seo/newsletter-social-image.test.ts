import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import type { Newsletter } from '@/lib/content/types'
import {
  NEWSLETTER_SOCIAL_IMAGE_SIZE,
  newsletterSocialImageSpec,
  renderNewsletterSocialImage,
} from '@/lib/seo/newsletter-social-image'

const EXPECTED = {
  contraption: {
    alt: 'Contraption wordmark',
    background: '#f2f2f1',
    logoPath: '/images/contraption.svg',
    logoWidth: 504,
    logoHeight: 91,
  },
  workshop: {
    alt: 'Workshop wordmark',
    background: '#f3f0e9',
    logoPath: '/images/workshop-brand.svg',
    logoWidth: 504,
    logoHeight: 140,
  },
  postcard: {
    alt: 'Postcard wordmark',
    background: '#f5f6fa',
    logoPath: '/images/postcard.svg',
    logoWidth: 504,
    logoHeight: 115,
  },
  tidbits: {
    alt: 'tidbits wordmark',
    background: '#f6eae9',
    logoPath: '/images/tidbits.svg',
    logoWidth: 504,
    logoHeight: 116,
  },
  tsundoku: {
    alt: 'Tsundoku wordmark',
    background: '#f4f4f2',
    logoPath: '/images/tsundoku.svg',
    logoWidth: 504,
    logoHeight: 77,
  },
} as const satisfies Record<Newsletter, object>

describe('newsletter social images', () => {
  it.each(
    Object.entries(EXPECTED)
  )('uses the landing-page brand system for %s', (newsletter, expected) => {
    expect(newsletterSocialImageSpec(newsletter as Newsletter)).toEqual(
      expected
    )
  })

  it.each(
    Object.keys(EXPECTED)
  )('renders a 1200×630 PNG for %s', async (newsletter) => {
    const response = await renderNewsletterSocialImage(newsletter as Newsletter)
    const image = await response.arrayBuffer()
    const metadata = await sharp(image).metadata()

    expect(response.headers.get('content-type')).toBe('image/png')
    expect(metadata).toMatchObject({
      format: 'png',
      ...NEWSLETTER_SOCIAL_IMAGE_SIZE,
    })
  })
})
