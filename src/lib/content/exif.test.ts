import { describe, expect, it } from 'vitest'
import { formatPhotoExif, parseImageExif } from '@/lib/content/exif'

function writeEntry(
  buf: Buffer,
  entry: number,
  tag: number,
  type: number,
  count: number,
  value: number
) {
  buf.writeUInt16LE(tag, entry)
  buf.writeUInt16LE(type, entry + 2)
  buf.writeUInt32LE(count, entry + 4)
  if (type === 3 && count === 1) {
    buf.writeUInt16LE(value, entry + 8)
    buf.writeUInt16LE(0, entry + 10)
  } else {
    buf.writeUInt32LE(value, entry + 8)
  }
}

function writeRational(
  buf: Buffer,
  entry: number,
  tag: number,
  offset: number,
  numerator: number,
  denominator: number
) {
  writeEntry(buf, entry, tag, 5, 1, offset)
  buf.writeUInt32LE(numerator, offset)
  buf.writeUInt32LE(denominator, offset + 4)
}

function buildExifJpeg(): Buffer {
  const tiff = Buffer.alloc(220)
  tiff.write('II', 0, 'ascii')
  tiff.writeUInt16LE(42, 2)
  tiff.writeUInt32LE(8, 4)

  const ifd0 = 8
  tiff.writeUInt16LE(3, ifd0)
  const ifd0Data = 50
  const makeOffset = ifd0Data
  const modelOffset = makeOffset + 6
  const exifOffset = modelOffset + 14
  tiff.write('Apple\0', makeOffset, 'ascii')
  tiff.write('iPhone 15 Pro\0', modelOffset, 'ascii')

  writeEntry(tiff, ifd0 + 2, 0x010f, 2, 6, makeOffset)
  writeEntry(tiff, ifd0 + 14, 0x0110, 2, 14, modelOffset)
  writeEntry(tiff, ifd0 + 26, 0x8769, 4, 1, exifOffset)
  tiff.writeUInt32LE(0, ifd0 + 38)

  tiff.writeUInt16LE(5, exifOffset)
  const exifEntries = exifOffset + 2
  const rationalData = exifOffset + 2 + 5 * 12 + 4
  writeRational(tiff, exifEntries, 0x829d, rationalData, 18, 10)
  writeRational(tiff, exifEntries + 12, 0x829a, rationalData + 8, 1, 120)
  writeEntry(tiff, exifEntries + 24, 0x8827, 3, 1, 64)
  writeRational(tiff, exifEntries + 36, 0x920a, rationalData + 16, 686, 100)
  writeEntry(tiff, exifEntries + 48, 0xa405, 3, 1, 24)
  tiff.writeUInt32LE(0, exifOffset + 2 + 5 * 12)

  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff])
  const segment = Buffer.alloc(payload.length + 4)
  segment[0] = 0xff
  segment[1] = 0xe1
  segment.writeUInt16BE(payload.length + 2, 2)
  payload.copy(segment, 4)

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment,
    Buffer.from([0xff, 0xd9]),
  ])
}

describe('EXIF parsing', () => {
  it('parses and formats camera settings from JPEG EXIF', () => {
    const raw = parseImageExif(buildExifJpeg())
    expect(raw).toMatchObject({
      make: 'Apple',
      model: 'iPhone 15 Pro',
      fNumber: 1.8,
      exposureTime: 1 / 120,
      iso: 64,
      focalLength35mm: 24,
    })

    expect(formatPhotoExif(raw!)).toEqual({
      camera: 'iPhone 15 Pro',
      lens: undefined,
      settings: ['24 mm', 'f/1.8', '1/120', 'ISO 64'],
    })
  })

  it('returns undefined when an image has no EXIF segment', () => {
    expect(
      parseImageExif(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
    ).toBeUndefined()
  })
})
