import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  containedImageRect,
  ImageZoomOverlay,
  type ZoomedImage,
} from '@/components/ui/image-zoom-overlay'

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
    expect(html).toContain('aria-label="tidbits photo viewer"')
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

  it('disables only the unavailable edge control', () => {
    const firstHtml = renderOverlay(immersiveImage(0))
    const lastHtml = renderOverlay(immersiveImage(2))

    expect(controlTag(firstHtml, 'Previous image')).toContain('disabled=""')
    expect(controlTag(firstHtml, 'Next image')).not.toContain('disabled=""')
    expect(controlTag(lastHtml, 'Previous image')).not.toContain('disabled=""')
    expect(controlTag(lastHtml, 'Next image')).toContain('disabled=""')
  })

  it('keeps the legacy caption viewer on the rail presentation', () => {
    const image = immersiveImage()
    image.caption = {
      ...image.caption!,
      presentation: 'rail',
      collection: 'tsundoku',
    }

    const html = renderOverlay(image)

    expect(html).toContain('landscape:grid-cols-')
    expect(html).toContain('aria-label="Tsundoku"')
    expect(html).not.toContain('immersive-zoom-stage')
    expect(html).not.toContain('immersive-zoom-chrome')
  })
})
