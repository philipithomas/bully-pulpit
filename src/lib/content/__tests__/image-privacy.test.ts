import { describe, expect, it } from 'vitest'
import { hasEmbeddedLocationMetadata } from '@/lib/content/image-privacy'

describe('image privacy', () => {
  it('detects partial EXIF GPS data, not only complete coordinates', () => {
    expect(
      hasEmbeddedLocationMetadata({
        gps: {
          GPSLatitude: [35, 40, 0],
        },
      })
    ).toBe(true)
  })

  it('detects location coordinates nested in XMP metadata', () => {
    expect(
      hasEmbeddedLocationMetadata({
        xmp: {
          LocationShown: {
            latitude: 35.6812,
          },
        },
      })
    ).toBe(true)
  })

  it('allows a harmless empty GPS directory version marker', () => {
    expect(
      hasEmbeddedLocationMetadata({
        gps: {
          GPSVersionID: '2.3.0.0',
        },
      })
    ).toBe(false)
  })

  it('does not treat descriptive non-coordinate metadata as GPS', () => {
    expect(
      hasEmbeddedLocationMetadata({
        exif: {
          ISOSpeedLatitudeyyy: 3200,
          ISOSpeedLatitudezzz: 3200,
        },
        iptc: {
          City: 'Tokyo',
          Caption: 'A street photograph',
        },
      })
    ).toBe(false)
  })
})
