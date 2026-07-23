import { describe, expect, it } from 'vitest'
import {
  photoMetadataItems,
  photoMetadataLabeledText,
  photoMetadataText,
} from '@/lib/content/photo-metadata'
import { frontmatterSchema, photoMetadataSchema } from '@/lib/content/types'

const PHOTO = {
  camera: 'Leica M11-P',
  lens: 'Summicron-M 35 f/2 ASPH.',
  focalLength: '35 mm',
  aperture: 'f/5.6',
  apertureEstimated: true,
  exposureTime: '1/250 s',
  iso: 2000,
}

describe('photo metadata', () => {
  it('formats equipment and exposure values in a stable order', () => {
    expect(photoMetadataItems(PHOTO)).toEqual([
      { key: 'camera', label: 'Camera', value: 'Leica M11-P' },
      {
        key: 'lens',
        label: 'Lens',
        value: 'Summicron-M 35 f/2 ASPH.',
      },
      { key: 'focalLength', label: 'Focal length', value: '35 mm' },
      {
        key: 'aperture',
        label: 'Aperture',
        value: 'f/5.6',
        estimated: true,
      },
      { key: 'exposureTime', label: 'Exposure time', value: '1/250 s' },
      { key: 'iso', label: 'ISO', value: 'ISO 2000' },
    ])
    expect(photoMetadataText(PHOTO)).toBe(
      'Leica M11-P · Summicron-M 35 f/2 ASPH. · 35 mm · f/5.6 (estimated) · 1/250 s · ISO 2000'
    )
    expect(photoMetadataLabeledText(PHOTO)).toBe(
      'Camera: Leica M11-P; Lens: Summicron-M 35 f/2 ASPH.; Focal length: 35 mm; Aperture: f/5.6 (estimated); Exposure time: 1/250 s; ISO: 2000'
    )
  })

  it('accepts partial metadata but rejects an empty object', () => {
    expect(photoMetadataSchema.parse({ camera: 'Leica M11-P' })).toEqual({
      camera: 'Leica M11-P',
    })
    expect(photoMetadataSchema.safeParse({}).success).toBe(false)
  })

  it('requires an aperture before it can be marked estimated', () => {
    expect(
      photoMetadataSchema.safeParse({ apertureEstimated: true }).success
    ).toBe(false)
  })

  it('rejects GPS and other unknown photo fields', () => {
    expect(
      photoMetadataSchema.safeParse({
        camera: 'Leica M11-P',
        gpsLatitude: 35.6812,
      }).success
    ).toBe(false)
  })

  it('preserves photo metadata through the shared frontmatter schema', () => {
    const parsed = frontmatterSchema.parse({
      title: 'A photo',
      photo: PHOTO,
    })
    expect(parsed.photo).toEqual(PHOTO)
  })
})
