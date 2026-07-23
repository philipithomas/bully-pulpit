import { describe, expect, it } from 'vitest'
import {
  fNumberFromApertureValue,
  formatExposureTime,
  photoMetadataFromExif,
  photoMetadataYaml,
} from '@/../scripts/read-photo-metadata'

describe('read photo metadata', () => {
  it('formats common exposure times', () => {
    expect(formatExposureTime(0.004)).toBe('1/250 s')
    expect(formatExposureTime(0.5)).toBe('1/2 s')
    expect(formatExposureTime(2)).toBe('2 s')
  })

  it('does not round decimal exposures to a different reciprocal', () => {
    expect(formatExposureTime(0.4)).toBe('0.4 s')
    expect(formatExposureTime(0.6)).toBe('0.6 s')
  })

  it('converts the EXIF APEX aperture value to an f-number', () => {
    expect(fNumberFromApertureValue(4.96)).toBeCloseTo(5.6, 1)
  })

  it('normalizes M11-P metadata and marks its calculated aperture estimated', () => {
    const photo = photoMetadataFromExif({
      Make: 'Leica Camera AG',
      Model: 'LEICA M11-P',
      LensModel: 'Summicron-M 1:2/35 ASPH.',
      FocalLength: 35,
      ApertureValue: 4.96,
      ExposureTime: 0.004,
      ISO: 2000,
    })

    expect(photo).toEqual({
      camera: 'Leica M11-P',
      lens: 'Leica Summicron-M 35 f/2 ASPH.',
      focalLength: '35 mm',
      aperture: 'f/5.6',
      apertureEstimated: true,
      exposureTime: '1/250 s',
      iso: 2000,
    })
    expect(photoMetadataYaml(photo)).toBe(
      [
        'photo:',
        '  camera: "Leica M11-P"',
        '  lens: "Leica Summicron-M 35 f/2 ASPH."',
        '  focalLength: "35 mm"',
        '  aperture: "f/5.6"',
        '  apertureEstimated: true',
        '  exposureTime: "1/250 s"',
        '  iso: 2000',
      ].join('\n')
    )
  })

  it('treats a standard FNumber as exact', () => {
    expect(
      photoMetadataFromExif({
        Model: 'Some camera',
        FNumber: 2.8,
      })
    ).toEqual({
      camera: 'Some camera',
      aperture: 'f/2.8',
    })
  })

  it('still marks an M11-P FNumber as camera-estimated', () => {
    expect(
      photoMetadataFromExif({
        Model: 'LEICA M11-P',
        FNumber: 2.8,
      })
    ).toEqual({
      camera: 'Leica M11-P',
      aperture: 'f/2.8',
      apertureEstimated: true,
    })
  })
})
