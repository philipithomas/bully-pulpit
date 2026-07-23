import exifr from 'exifr'

const SAFE_LOCATION_KEYS = new Set(['gps', 'gpsversionid'])

function isEmbeddedLocationKey(key: string): boolean {
  const localKey = key.split(/[:.]/).at(-1) ?? key
  if (SAFE_LOCATION_KEYS.has(localKey.toLowerCase())) return false
  return (
    /gps|geo(?:tag|location)/i.test(localKey) ||
    /^(?:latitude|longitude|coordinates?)$/i.test(localKey)
  )
}

export function hasEmbeddedLocationMetadata(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false

  for (const [key, field] of Object.entries(value)) {
    if (field !== undefined && field !== null && isEmbeddedLocationKey(key)) {
      return true
    }
    if (field && typeof field === 'object') {
      if (hasEmbeddedLocationMetadata(field)) return true
    }
  }
  return false
}

export async function imageHasEmbeddedLocationMetadata(
  filePath: string
): Promise<boolean> {
  const metadata = await exifr.parse(filePath, {
    gps: true,
    xmp: true,
    iptc: true,
    mergeOutput: false,
  })
  return hasEmbeddedLocationMetadata(metadata)
}
