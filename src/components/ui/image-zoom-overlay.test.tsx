import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  containedImageRect,
  ImageZoomOverlay,
  type ZoomedImage,
} from '@/components/ui/image-zoom-overlay'
import { TIDBITS_PALETTES, tidbitsPaletteForPost } from '@/lib/tidbits/palette'

function galleryItem(
  src: string,
  title: string
): NonNullable<ZoomedImage['gallery']>['items'][number] {
  return {
    src,
    originalSrc: src,
    fullSrc: null,
    alt: title,
    width: null,
    height: null,
    caption: {
      href: `/${title.toLowerCase()}`,
      title,
      presentation: 'immersive',
      collection: 'tidbits',
    },
  }
}

function immersiveImage(index = 1): ZoomedImage {
  const items = [
    galleryItem('/images/one.jpg', 'One'),
    galleryItem('/images/sfmoma.jpg', 'SFMOMA'),
    galleryItem('/images/three.jpg', 'Three'),
  ]

  return {
    ...items[index],
    alt: 'Four colorful artworks hanging above a bench',
    rect: null,
    caption: {
      href: '/sfmoma',
      title: 'SFMOMA',
      description: '',
      date: '2026-07-11',
      locationName: 'San Francisco Museum of Modern Art',
      locationUrl: 'https://maps.app.goo.gl/YHxezDBcwdY6quHX9',
      photo: {
        camera: 'Leica M11-P',
        lens: 'Summicron-M 35 f/2 ASPH.',
        focalLength: '35 mm',
        aperture: 'f/5.6',
        apertureEstimated: true,
        exposureTime: '1/250 s',
        iso: 2000,
      },
      presentation: 'immersive',
      collection: 'tidbits',
    },
    gallery: { items, index },
  }
}

function renderOverlay(image: ZoomedImage): string {
  return renderToStaticMarkup(
    <ImageZoomOverlay
      image={image}
      onClose={vi.fn()}
      onNavigate={vi.fn()}
      onNavigateTo={vi.fn()}
    />
  )
}

function controlTag(html: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (
    html.match(
      new RegExp(`<button[^>]*aria-label="${escapedLabel}"[^>]*>`)
    )?.[0] ?? ''
  )
}

describe('ImageZoomOverlay', () => {
  it('measures the visible photo inside a letterboxed immersive stage', () => {
    const rect = containedImageRect(
      { top: 0, left: 0, width: 896, height: 800 },
      2560,
      1574
    )

    expect(rect.left).toBe(0)
    expect(rect.width).toBe(896)
    expect(rect.height).toBeCloseTo(550.9, 1)
    expect(rect.top).toBeCloseTo(124.55, 2)
  })

  it('starts the immersive viewer photo-first with details behind a disclosure', () => {
    const html = renderOverlay(immersiveImage())

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Tidbits photo viewer"')
    expect(html).toContain('aria-describedby=')
    expect(html).toContain('aria-label="Close image viewer"')
    expect(html).toContain('aria-label="Previous image"')
    expect(html).toContain('aria-label="Next image"')
    expect(html).toContain('aria-label="Open original image in new tab"')
    expect(html).toContain('aria-label="Show photo details"')
    expect(html).toContain('aria-controls=')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('role="status"')
    expect(html).toContain('image 2 of 3')
    expect(html).not.toContain('data-zoom-caption-panel=""')
    expect(html).not.toContain('2026-07-11')
    expect(html).not.toContain('San Francisco Museum of Modern Art')
    expect(html).not.toContain('Open post')
    expect(html).not.toContain('<p class=')
  })

  it('keeps both directions available at photo collection boundaries', () => {
    const firstHtml = renderOverlay(immersiveImage(0))
    const lastHtml = renderOverlay(immersiveImage(2))

    expect(controlTag(firstHtml, 'Previous image')).not.toContain('disabled=""')
    expect(controlTag(firstHtml, 'Next image')).not.toContain('disabled=""')
    expect(controlTag(lastHtml, 'Previous image')).not.toContain('disabled=""')
    expect(controlTag(lastHtml, 'Next image')).not.toContain('disabled=""')
  })

  it('preserves bounded navigation for ordinary galleries', () => {
    const image = immersiveImage(0)
    image.caption = null
    const html = renderOverlay(image)

    expect(controlTag(html, 'Previous image')).toContain('disabled=""')
    expect(controlTag(html, 'Next image')).not.toContain('disabled=""')
    expect(html).not.toContain('data-zoom-tidbits-accent')
    expect(html).not.toContain('pan-y pinch-zoom')
  })

  it('makes circular photo controls available while the rest of the album loads', () => {
    const image = immersiveImage(0)
    image.photoNeighbors = {
      newer: image.gallery!.items[2],
      older: null,
      total: 17,
      index: 0,
    }
    image.gallery = undefined
    const html = renderOverlay(image)

    expect(html).toContain('image 1 of 17')
    expect(controlTag(html, 'Previous image')).not.toContain('disabled=""')
    expect(controlTag(html, 'Next image')).not.toContain('disabled=""')
  })

  it('shows a palette accent while details are collapsed without recoloring the canvas', () => {
    const html = renderOverlay(immersiveImage())
    const palette = tidbitsPaletteForPost('sfmoma')

    expect(html).toContain('data-zoom-tidbits-accent=""')
    expect(html).toContain(`--photo-viewer-paper:${palette.paper}`)
    expect(html).toContain(`--photo-viewer-ink:${palette.ink}`)
    expect(html).toContain(`--photo-viewer-accent:${palette.accent}`)
    expect(html).toContain('bg-[#0A0A0A]')
    expect(html).toContain('duration-300 motion-reduce:transition-none')
    expect(html).not.toContain('--tidbits-paper:')
  })

  it('keeps normal-sized viewer text readable on every palette paper', () => {
    const html = renderOverlay(immersiveImage())
    const body = html.match(/--photo-viewer-body:(#[0-9a-f]{6})/)?.[1]
    const muted = html.match(/--photo-viewer-muted:(#[0-9a-f]{6})/)?.[1]
    expect(body).toBeDefined()
    expect(muted).toBeDefined()
    function luminance(hex: string) {
      const channels = hex
        .slice(1)
        .match(/../g)!
        .map((channel) => {
          const value = Number.parseInt(channel, 16) / 255
          return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4
        })
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
    }
    for (const palette of TIDBITS_PALETTES) {
      for (const text of [palette.ink, body!, muted!]) {
        expect(
          (luminance(palette.paper) + 0.05) / (luminance(text) + 0.05)
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('keeps the legacy caption viewer on the rail presentation', () => {
    const image = immersiveImage()
    image.caption = {
      ...image.caption!,
      presentation: 'rail',
      collection: 'tsundoku',
    }

    const html = renderOverlay(image)
    const captionPanel =
      html.match(
        /<aside[^>]*data-zoom-caption-panel=""[^>]*>[\s\S]*?<\/aside>/
      )?.[0] ?? ''

    expect(html).toContain('landscape:grid-cols-')
    expect(html).toContain('aria-label="Tsundoku"')
    expect(html).toContain('aria-label="Photo metadata"')
    expect(html).toContain('Leica M11-P')
    expect(html).toContain('Summicron-M 35 f/2 ASPH.')
    expect(html).toContain('35 mm')
    expect(html).toContain('f/5.6')
    expect(html).toContain('1/250 s')
    expect(html).toContain('ISO 2000')
    expect(html).toContain('data-slot="popover-trigger"')
    expect(html).not.toMatch(/>\s*Estimated(?: aperture)?\s*</)
    expect(captionPanel.indexOf('aria-label="Photo metadata"')).toBeGreaterThan(
      captionPanel.indexOf('>SFMOMA</h2>')
    )
    expect(html).not.toContain('immersive-zoom-stage')
    expect(html).not.toContain('immersive-zoom-chrome')
    expect(html).toContain('pan-y pinch-zoom')
    expect(html).not.toContain('data-zoom-tidbits-accent')
    expect(html).not.toContain('--photo-viewer-paper:')
  })
})
