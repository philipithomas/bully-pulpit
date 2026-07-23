import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PhotoMetadata } from '@/components/posts/photo-metadata'

const completePhoto = {
  camera: 'Leica M11-P',
  lens: 'Summicron-M 35 f/2 ASPH.',
  focalLength: '35 mm',
  aperture: 'f/5.6',
  apertureEstimated: true,
  exposureTime: '1/250 s',
  iso: 2000,
} as const

describe('PhotoMetadata', () => {
  it('renders every shooting value in mono and exposes an estimated aperture through a popover', () => {
    const html = renderToStaticMarkup(<PhotoMetadata photo={completePhoto} />)

    expect(html).toContain('aria-label="Photo metadata"')
    expect(html).toContain('Leica M11-P')
    expect(html).toContain('Summicron-M 35 f/2 ASPH.')
    expect(html).toContain('35 mm')
    expect(html).toContain('f/5.6')
    expect(html).toContain('1/250 s')
    expect(html).toContain('ISO 2000')
    expect(html).toContain('font-mono')
    expect(html).toContain('data-slot="popover-trigger"')
    expect(html).toContain('aria-label="Aperture: f/5.6, estimated"')
    expect(html).not.toMatch(/>\s*Estimated(?: aperture)?\s*</)
  })

  it('renders an exact aperture as plain metadata', () => {
    const html = renderToStaticMarkup(
      <PhotoMetadata photo={{ ...completePhoto, apertureEstimated: false }} />
    )

    expect(html).toContain('f/5.6')
    expect(html).not.toContain('data-slot="popover-trigger"')
    expect(html).not.toContain(', estimated')
  })
})
