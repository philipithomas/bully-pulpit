import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
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
      collection: 'umami',
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
      collection: 'umami',
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
  it('renders immersive chrome and useful metadata without an empty description', () => {
    const html = renderOverlay(immersiveImage())

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Close image viewer"')
    expect(html).toContain('aria-label="Previous image"')
    expect(html).toContain('aria-label="Next image"')
    expect(html).toContain('aria-label="Open original image in new tab"')
    expect(html).toContain('data-zoom-caption-panel=""')
    expect(html).toContain('SFMOMA')
    expect(html).toContain('2026-07-11')
    expect(html).toContain('San Francisco Museum of Modern Art')
    expect(html).toContain('https://maps.app.goo.gl/YHxezDBcwdY6quHX9')
    expect(html).toContain('2 / 3')
    expect(html).toContain('SFMOMA, image 2 of')
    expect(html).toContain('aria-label="umami"')
    expect(html).toContain('Open post')
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
