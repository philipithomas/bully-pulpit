export const MAX_PUBLIC_IMAGE_EDGE = 5120
export const MAX_PUBLIC_IMAGE_BYTES = 8 * 1024 * 1024
export const PUBLIC_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
]

export function formatImageBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
  return `${bytes}B`
}

export function isPolicyImagePath(filePath: string): boolean {
  const lower = filePath.toLowerCase()
  return PUBLIC_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}
