import fs from 'node:fs'
import path from 'node:path'

const PUBLIC_DIR = path.join(process.cwd(), 'public')

interface RawExif {
  make?: string
  model?: string
  lensModel?: string
  focalLength?: number
  focalLength35mm?: number
  fNumber?: number
  exposureTime?: number
  iso?: number
}

export interface PhotoExif {
  camera?: string
  lens?: string
  settings: string[]
}

type ByteOrder = 'le' | 'be'

const TYPE_SIZE: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8, // SRATIONAL
}

function readUInt16(buf: Buffer, offset: number, order: ByteOrder): number {
  return order === 'le' ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset)
}

function readUInt32(buf: Buffer, offset: number, order: ByteOrder): number {
  return order === 'le' ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset)
}

function readInt32(buf: Buffer, offset: number, order: ByteOrder): number {
  return order === 'le' ? buf.readInt32LE(offset) : buf.readInt32BE(offset)
}

function inBounds(buf: Buffer, offset: number, length: number): boolean {
  return offset >= 0 && length >= 0 && offset + length <= buf.length
}

function cleanAscii(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/\0/g, '').replace(/\s+/g, ' ').trim()
  return cleaned || undefined
}

function valueOffset(
  buf: Buffer,
  tiffStart: number,
  entry: number,
  type: number,
  count: number,
  order: ByteOrder
): { offset: number; byteLength: number } | undefined {
  const byteLength = (TYPE_SIZE[type] ?? 0) * count
  if (byteLength === 0) return undefined

  const offset =
    byteLength <= 4 ? entry + 8 : tiffStart + readUInt32(buf, entry + 8, order)
  if (!inBounds(buf, offset, byteLength)) return undefined

  return { offset, byteLength }
}

function readAscii(
  buf: Buffer,
  tiffStart: number,
  entry: number,
  type: number,
  count: number,
  order: ByteOrder
): string | undefined {
  if (type !== 2) return undefined
  const loc = valueOffset(buf, tiffStart, entry, type, count, order)
  if (!loc) return undefined
  return cleanAscii(
    buf.toString('utf8', loc.offset, loc.offset + loc.byteLength)
  )
}

function readShortOrLong(
  buf: Buffer,
  tiffStart: number,
  entry: number,
  type: number,
  count: number,
  order: ByteOrder
): number | undefined {
  if (count < 1 || (type !== 3 && type !== 4)) return undefined
  const loc = valueOffset(buf, tiffStart, entry, type, count, order)
  if (!loc) return undefined
  return type === 3
    ? readUInt16(buf, loc.offset, order)
    : readUInt32(buf, loc.offset, order)
}

function readRational(
  buf: Buffer,
  tiffStart: number,
  entry: number,
  type: number,
  count: number,
  order: ByteOrder
): number | undefined {
  if (count < 1 || (type !== 5 && type !== 10)) return undefined
  const loc = valueOffset(buf, tiffStart, entry, type, count, order)
  if (!loc) return undefined

  const numerator =
    type === 10
      ? readInt32(buf, loc.offset, order)
      : readUInt32(buf, loc.offset, order)
  const denominator =
    type === 10
      ? readInt32(buf, loc.offset + 4, order)
      : readUInt32(buf, loc.offset + 4, order)
  if (denominator === 0) return undefined
  return numerator / denominator
}

function parseIfd(
  buf: Buffer,
  tiffStart: number,
  ifdOffset: number,
  order: ByteOrder
): { tags: Map<number, number>; exif: RawExif } {
  const tags = new Map<number, number>()
  const exif: RawExif = {}
  const absolute = tiffStart + ifdOffset
  if (!inBounds(buf, absolute, 2)) return { tags, exif }

  const entries = readUInt16(buf, absolute, order)
  for (let i = 0; i < entries; i++) {
    const entry = absolute + 2 + i * 12
    if (!inBounds(buf, entry, 12)) break

    const tag = readUInt16(buf, entry, order)
    const type = readUInt16(buf, entry + 2, order)
    const count = readUInt32(buf, entry + 4, order)
    tags.set(tag, entry)

    if (tag === 0x010f) {
      exif.make = readAscii(buf, tiffStart, entry, type, count, order)
    } else if (tag === 0x0110) {
      exif.model = readAscii(buf, tiffStart, entry, type, count, order)
    } else if (tag === 0xa434) {
      exif.lensModel = readAscii(buf, tiffStart, entry, type, count, order)
    } else if (tag === 0x829d) {
      exif.fNumber = readRational(buf, tiffStart, entry, type, count, order)
    } else if (tag === 0x829a) {
      exif.exposureTime = readRational(
        buf,
        tiffStart,
        entry,
        type,
        count,
        order
      )
    } else if (tag === 0x8827) {
      exif.iso = readShortOrLong(buf, tiffStart, entry, type, count, order)
    } else if (tag === 0x920a) {
      exif.focalLength = readRational(buf, tiffStart, entry, type, count, order)
    } else if (tag === 0xa405) {
      exif.focalLength35mm = readShortOrLong(
        buf,
        tiffStart,
        entry,
        type,
        count,
        order
      )
    }
  }

  return { tags, exif }
}

function mergeExif(target: RawExif, source: RawExif) {
  for (const [key, value] of Object.entries(source) as Array<
    [keyof RawExif, RawExif[keyof RawExif]]
  >) {
    if (value !== undefined) target[key] = value as never
  }
}

export function parseImageExif(buf: Buffer): RawExif | undefined {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return undefined

  let cursor = 2
  while (cursor < buf.length - 4) {
    if (buf[cursor] !== 0xff) break
    const marker = buf[cursor + 1]
    const segmentLength = buf.readUInt16BE(cursor + 2)
    const segmentStart = cursor + 4
    const segmentEnd = cursor + 2 + segmentLength
    if (!inBounds(buf, segmentStart, segmentLength - 2)) break

    if (
      marker === 0xe1 &&
      buf.toString('ascii', segmentStart, segmentStart + 6) === 'Exif\0\0'
    ) {
      const tiffStart = segmentStart + 6
      if (!inBounds(buf, tiffStart, 8)) return undefined

      const byteOrder = buf.toString('ascii', tiffStart, tiffStart + 2)
      const order: ByteOrder | undefined =
        byteOrder === 'II' ? 'le' : byteOrder === 'MM' ? 'be' : undefined
      if (!order || readUInt16(buf, tiffStart + 2, order) !== 42) {
        return undefined
      }

      const firstIfdOffset = readUInt32(buf, tiffStart + 4, order)
      const first = parseIfd(buf, tiffStart, firstIfdOffset, order)
      const raw: RawExif = { ...first.exif }
      const exifPointerEntry = first.tags.get(0x8769)
      if (exifPointerEntry) {
        const type = readUInt16(buf, exifPointerEntry + 2, order)
        const count = readUInt32(buf, exifPointerEntry + 4, order)
        const exifOffset = readShortOrLong(
          buf,
          tiffStart,
          exifPointerEntry,
          type,
          count,
          order
        )
        if (exifOffset !== undefined) {
          mergeExif(raw, parseIfd(buf, tiffStart, exifOffset, order).exif)
        }
      }

      return Object.values(raw).some((value) => value !== undefined)
        ? raw
        : undefined
    }

    cursor = segmentEnd
  }

  return undefined
}

function cameraName(make: string | undefined, model: string | undefined) {
  if (!make) return model
  if (!model) return make
  if (make.toLowerCase() === 'apple') return model
  if (model.toLowerCase().includes(make.toLowerCase())) return model
  return `${make} ${model}`
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? value.toString()
    : value.toFixed(1).replace(/\.0$/, '')
}

function formatExposure(seconds: number): string {
  if (seconds > 0 && seconds < 1) {
    return `1/${Math.round(1 / seconds)}`
  }
  return `${formatNumber(seconds)} s`
}

export function formatPhotoExif(raw: RawExif): PhotoExif | undefined {
  const settings: string[] = []
  const focalLength = raw.focalLength35mm ?? raw.focalLength
  if (focalLength) settings.push(`${formatNumber(focalLength)} mm`)
  if (raw.fNumber) settings.push(`f/${formatNumber(raw.fNumber)}`)
  if (raw.exposureTime) settings.push(formatExposure(raw.exposureTime))
  if (raw.iso) settings.push(`ISO ${raw.iso}`)

  const exif = {
    camera: cameraName(raw.make, raw.model),
    lens: raw.lensModel,
    settings,
  }

  return exif.camera || exif.lens || exif.settings.length > 0 ? exif : undefined
}

export function getPhotoExif(
  publicPath: string | undefined
): PhotoExif | undefined {
  if (!publicPath) return undefined
  const filePath = path.join(PUBLIC_DIR, publicPath)
  if (!fs.existsSync(filePath)) return undefined

  try {
    const raw = parseImageExif(fs.readFileSync(filePath))
    return raw ? formatPhotoExif(raw) : undefined
  } catch {
    return undefined
  }
}
