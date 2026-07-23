import type { PhotoMetadata } from '@/lib/content/types'

export type PhotoMetadataKey =
  | 'camera'
  | 'lens'
  | 'focalLength'
  | 'aperture'
  | 'exposureTime'
  | 'iso'

export interface PhotoMetadataItem {
  key: PhotoMetadataKey
  label: string
  value: string
  estimated?: boolean
}

export function photoMetadataItems(
  photo: PhotoMetadata | null | undefined
): PhotoMetadataItem[] {
  if (!photo) return []

  const items: Array<PhotoMetadataItem | null> = [
    photo.camera
      ? { key: 'camera' as const, label: 'Camera', value: photo.camera }
      : null,
    photo.lens
      ? { key: 'lens' as const, label: 'Lens', value: photo.lens }
      : null,
    photo.focalLength
      ? {
          key: 'focalLength' as const,
          label: 'Focal length',
          value: photo.focalLength,
        }
      : null,
    photo.aperture
      ? {
          key: 'aperture' as const,
          label: 'Aperture',
          value: photo.aperture,
          estimated: photo.apertureEstimated === true,
        }
      : null,
    photo.exposureTime
      ? {
          key: 'exposureTime' as const,
          label: 'Exposure time',
          value: photo.exposureTime,
        }
      : null,
    photo.iso
      ? {
          key: 'iso' as const,
          label: 'ISO',
          value: `ISO ${photo.iso}`,
        }
      : null,
  ]
  return items.filter((item): item is PhotoMetadataItem => item !== null)
}

export function photoMetadataText(
  photo: PhotoMetadata | null | undefined
): string {
  return photoMetadataItems(photo)
    .map((item) => (item.estimated ? `${item.value} (estimated)` : item.value))
    .join(' · ')
}

export function photoMetadataLabeledText(
  photo: PhotoMetadata | null | undefined
): string {
  return photoMetadataItems(photo)
    .map((item) => {
      const value =
        item.key === 'iso' ? item.value.replace(/^ISO /, '') : item.value
      return `${item.label}: ${value}${item.estimated ? ' (estimated)' : ''}`
    })
    .join('; ')
}
