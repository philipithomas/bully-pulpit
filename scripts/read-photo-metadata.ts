import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import exifr from 'exifr'
import type { PhotoMetadata } from '@/lib/content/types'

interface ExifPhotoFields {
  Make?: string
  Model?: string
  LensModel?: string
  FocalLength?: number
  FNumber?: number
  ApertureValue?: number
  ExposureTime?: number
  ISO?: number
}

const OFFICIAL_LENS_NAMES: Record<string, string> = {
  'Summicron-M 1:2/35 ASPH.': 'Summicron-M 35 f/2 ASPH.',
}

function displayNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(/\.0$/, '')
}

function displayDuration(value: number): string {
  return String(Number(value.toFixed(6)))
}

export function formatExposureTime(seconds: number): string {
  if (seconds <= 0 || !Number.isFinite(seconds)) {
    throw new Error('ExposureTime must be a positive number')
  }
  if (seconds >= 1) return `${displayDuration(seconds)} s`

  const reciprocal = 1 / seconds
  const denominator = Math.round(reciprocal)
  const isReciprocal =
    denominator >= 2 &&
    Math.abs(reciprocal - denominator) <=
      Math.max(1e-6, Math.abs(reciprocal) * 1e-6)
  return isReciprocal ? `1/${denominator} s` : `${displayDuration(seconds)} s`
}

export function fNumberFromApertureValue(apertureValue: number): number {
  return 2 ** (apertureValue / 2)
}

function normalizedCamera(model: string | undefined): string | undefined {
  if (!model) return undefined
  return model.replace(/^LEICA\b/, 'Leica').trim()
}

function normalizedLens(lens: string | undefined): string | undefined {
  if (!lens) return undefined
  return OFFICIAL_LENS_NAMES[lens.trim()] ?? lens.trim()
}

export function photoMetadataFromExif(fields: ExifPhotoFields): PhotoMetadata {
  const camera = normalizedCamera(fields.Model)
  const lens = normalizedLens(fields.LensModel)
  const apertureFromExif =
    typeof fields.FNumber === 'number'
      ? fields.FNumber
      : typeof fields.ApertureValue === 'number'
        ? fNumberFromApertureValue(fields.ApertureValue)
        : undefined
  const apertureEstimated =
    apertureFromExif !== undefined &&
    Boolean(fields.Model?.toUpperCase().includes('M11'))

  const photo: PhotoMetadata = {
    ...(camera ? { camera } : {}),
    ...(lens ? { lens } : {}),
    ...(typeof fields.FocalLength === 'number'
      ? { focalLength: `${displayNumber(fields.FocalLength)} mm` }
      : {}),
    ...(apertureFromExif !== undefined
      ? {
          aperture: `f/${displayNumber(apertureFromExif)}`,
          ...(apertureEstimated ? { apertureEstimated: true } : {}),
        }
      : {}),
    ...(typeof fields.ExposureTime === 'number'
      ? { exposureTime: formatExposureTime(fields.ExposureTime) }
      : {}),
    ...(typeof fields.ISO === 'number' ? { iso: Math.round(fields.ISO) } : {}),
  }

  if (Object.keys(photo).length === 0) {
    throw new Error('No supported photo metadata found')
  }
  return photo
}

export function photoMetadataYaml(photo: PhotoMetadata): string {
  const lines = ['photo:']
  if (photo.camera) lines.push(`  camera: ${JSON.stringify(photo.camera)}`)
  if (photo.lens) lines.push(`  lens: ${JSON.stringify(photo.lens)}`)
  if (photo.focalLength) {
    lines.push(`  focalLength: ${JSON.stringify(photo.focalLength)}`)
  }
  if (photo.aperture) {
    lines.push(`  aperture: ${JSON.stringify(photo.aperture)}`)
  }
  if (photo.apertureEstimated) lines.push('  apertureEstimated: true')
  if (photo.exposureTime) {
    lines.push(`  exposureTime: ${JSON.stringify(photo.exposureTime)}`)
  }
  if (photo.iso) lines.push(`  iso: ${photo.iso}`)
  return lines.join('\n')
}

async function readPhotoMetadata(filePath: string): Promise<PhotoMetadata> {
  const fields = (await exifr.parse(filePath, {
    pick: [
      'Make',
      'Model',
      'LensModel',
      'FocalLength',
      'FNumber',
      'ApertureValue',
      'ExposureTime',
      'ISO',
    ],
  })) as ExifPhotoFields | undefined

  if (!fields) throw new Error('No EXIF metadata found')
  return photoMetadataFromExif(fields)
}

async function main() {
  const inputs = process.argv.slice(2)
  if (inputs.length === 0) {
    throw new Error('Usage: pnpm photo:metadata <raw.dng> [more files...]')
  }

  for (const [index, input] of inputs.entries()) {
    const filePath = path.resolve(input)
    if (!fs.existsSync(filePath)) throw new Error(`${input} does not exist`)
    const photo = await readPhotoMetadata(filePath)
    if (inputs.length > 1) {
      if (index > 0) console.log('')
      console.log(`# ${path.basename(filePath)}`)
    }
    console.log(photoMetadataYaml(photo))
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
