import { describe, expect, it } from 'vitest'
import {
  CAPTIONED_ZOOM_IMAGE_SIZES,
  zoomImageDataAttrs,
  zoomImageSources,
} from '@/lib/content/zoom-image'

describe('zoom image sources', () => {
  it('builds optimized source sets up to the intrinsic width', () => {
    const sources = zoomImageSources({
      src: '/images/covers/tsundoku/geisha.jpg',
      dimensions: { width: 5120, height: 3258 },
      sizes: CAPTIONED_ZOOM_IMAGE_SIZES,
    })

    expect(sources?.src).toBe(
      '/_next/image?url=%2Fimages%2Fcovers%2Ftsundoku%2Fgeisha.jpg&w=5120&q=100'
    )
    expect(sources?.srcSet).toContain(
      '/_next/image?url=%2Fimages%2Fcovers%2Ftsundoku%2Fgeisha.jpg&w=1920&q=100 1920w'
    )
    expect(sources?.srcSet).toContain(
      '/_next/image?url=%2Fimages%2Fcovers%2Ftsundoku%2Fgeisha.jpg&w=5120&q=100 5120w'
    )
    expect(sources?.sizes).toBe(CAPTIONED_ZOOM_IMAGE_SIZES)
  })

  it('describes the source width when the optimizer request is rounded up', () => {
    const sources = zoomImageSources({
      src: '/images/covers/stripe-projects-launch-cover.jpg',
      dimensions: { width: 3472, height: 4640 },
    })

    expect(sources?.src).toContain('w=3840')
    expect(sources?.srcSet).toContain(' 3472w')
    expect(sources?.srcSet).not.toContain(' 3840w')
  })

  it('keeps common deployed image widths as exact optimizer requests', () => {
    expect(
      zoomImageSources({
        src: '/images/posts/moonlight-s-pitch-deck/1.jpg',
        dimensions: { width: 3200, height: 1945 },
      })?.src
    ).toContain('w=3200')
    expect(
      zoomImageSources({
        src: '/images/posts/rethinking-work-beyond-the-factory/02.jpg',
        dimensions: { width: 2400, height: 1600 },
      })?.src
    ).toContain('w=2400')
    expect(
      zoomImageSources({
        src: '/images/posts/july-2023/IMG_8596.jpeg',
        dimensions: { width: 4608, height: 3456 },
      })?.src
    ).toContain('w=4608')
  })

  it('emits compact data attributes for the client parser', () => {
    expect(
      zoomImageDataAttrs({
        src: '/images/covers/tsundoku/geisha.jpg',
        dimensions: { width: 5120, height: 3258 },
        sizes: CAPTIONED_ZOOM_IMAGE_SIZES,
      })
    ).toEqual({
      'data-full-src': '/images/covers/tsundoku/geisha.jpg',
      'data-full-width': '5120',
      'data-full-height': '3258',
      'data-full-sizes': CAPTIONED_ZOOM_IMAGE_SIZES,
    })
  })
})
