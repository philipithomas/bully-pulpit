import { describe, expect, it } from 'vitest'
import { photoGalleryItemFromPost } from '@/lib/content/photo-gallery'
import type { Post } from '@/lib/content/types'
import {
  CAPTIONED_ZOOM_IMAGE_SIZES,
  IMMERSIVE_ZOOM_IMAGE_SIZES,
} from '@/lib/content/zoom-image'

function photo(newsletter: 'tidbits' | 'tsundoku' = 'tidbits'): Post {
  return {
    slug: 'café & books',
    newsletter,
    frontmatter: {
      title: 'Coffee and books',
      publishedAt: '2026-09-02',
      coverImage: '/images/covers/coffee.jpg',
      coverImageAlt: 'Two books beside an espresso',
      location: { name: 'Copenhagen', url: 'https://example.com/copenhagen' },
      photo: {
        camera: 'Leica M11-P',
        iso: 200,
        aperture: 'f/4',
        apertureEstimated: true,
      },
      featured: false,
      draft: false,
    },
    coverDimensions: { width: 2400, height: 1600 },
    content: 'A **quiet** [morning](https://example.com).',
    excerpt: 'An excerpt that should not replace the caption.',
  }
}

describe('photo gallery serialization', () => {
  it.each([
    'tidbits',
    'tsundoku',
  ] as const)('preserves %s identity, metadata, and optimized image sources', (collection) => {
    const post = photo(collection)
    const item = photoGalleryItemFromPost(post)
    expect(item).toMatchObject({
      originalSrc: '/images/covers/coffee.jpg',
      alt: 'Two books beside an espresso',
      width: 2400,
      height: 1600,
      caption: {
        href: '/caf%C3%A9%20%26%20books',
        title: 'Coffee and books',
        description: 'A quiet morning.',
        date: '2026-09-02',
        locationName: 'Copenhagen',
        locationUrl: 'https://example.com/copenhagen',
        photo: post.frontmatter.photo,
        collection,
        presentation: collection === 'tidbits' ? 'immersive' : 'rail',
      },
    })
    const source = new URL(item.src, 'https://www.philipithomas.com')
    expect(source.pathname).toBe('/_next/image')
    expect(source.searchParams.get('url')).toBe('/images/covers/coffee.jpg')
    expect(source.searchParams.get('w')).toBe('1200')
    const fullSource = new URL(item.fullSrc!, 'https://www.philipithomas.com')
    expect(fullSource.searchParams.get('url')).toBe('/images/covers/coffee.jpg')
    expect(fullSource.searchParams.get('w')).toBe('2400')
    expect(item.fullSrcSet).toContain('2400w')
    expect(item.fullSizes).toBe(
      collection === 'tidbits'
        ? IMMERSIVE_ZOOM_IMAGE_SIZES
        : CAPTIONED_ZOOM_IMAGE_SIZES
    )
    expect(JSON.parse(JSON.stringify(item))).toEqual(item)
  })

  it('prefers the authored description and bounds a long viewer caption', () => {
    const post = photo()
    post.frontmatter.description = `  ${'a'.repeat(950)}  `
    expect(photoGalleryItemFromPost(post).caption?.description).toBe(
      `${'a'.repeat(900)}...`
    )
    post.frontmatter.description = '  An authored caption.  '
    expect(photoGalleryItemFromPost(post).caption?.description).toBe(
      'An authored caption.'
    )
  })

  it('serializes absent optional metadata without inventing shooting details', () => {
    const post = photo()
    post.frontmatter.photo = undefined
    post.frontmatter.location = undefined
    post.frontmatter.coverImageAlt = undefined
    expect(photoGalleryItemFromPost(post)).toMatchObject({
      alt: 'Coffee and books',
      caption: { photo: null, locationName: null, locationUrl: null },
    })
  })
})
