const EMAIL_IMAGE_QUALITY = 100

export function toVercelImagePath(
  imagePath: string,
  width: number,
  quality = EMAIL_IMAGE_QUALITY
): string {
  const params = new URLSearchParams({
    url: imagePath,
    w: String(width),
    q: String(quality),
  })
  return `/_next/image?${params.toString()}`
}

export function toVercelImageUrl(
  siteUrl: string,
  imagePath: string,
  width: number
) {
  if (!imagePath.startsWith('/') || imagePath.startsWith('//')) return imagePath
  return `${siteUrl}${toVercelImagePath(imagePath, width)}`
}
