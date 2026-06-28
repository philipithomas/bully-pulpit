import type { ImageDimensions } from '@/lib/content/types'

export const OPTIMIZED_IMAGE_WIDTHS = [
  640, 750, 828, 1080, 1200, 1920, 2000, 2800, 3840, 4000, 4032, 4638, 4640,
  8192,
] as const

const IMAGE_QUALITY = 100

export const PLAIN_ZOOM_IMAGE_SIZES = '90vw'
export const CAPTIONED_ZOOM_IMAGE_SIZES =
  '(max-width: 767px) 100vw, calc(100vw - 26rem)'

interface ZoomImageSource {
  src: string
  srcSet: string
  sizes: string
}

function optimizedImageSrc(src: string, width: number): string {
  const params = new URLSearchParams({
    url: src,
    w: String(width),
    q: String(IMAGE_QUALITY),
  })
  return `/_next/image?${params.toString()}`
}

function isOptimizablePublicImage(src: string): boolean {
  return (
    src.startsWith('/') && !src.startsWith('//') && !src.startsWith('/_next')
  )
}

function zoomImageCandidates(width: number): Array<{
  requestWidth: number
  descriptorWidth: number
}> {
  const smaller = OPTIMIZED_IMAGE_WIDTHS.filter((w) => w < width).map((w) => ({
    requestWidth: w,
    descriptorWidth: w,
  }))
  const full =
    OPTIMIZED_IMAGE_WIDTHS.find((w) => w >= width) ??
    OPTIMIZED_IMAGE_WIDTHS[OPTIMIZED_IMAGE_WIDTHS.length - 1]

  return [
    ...smaller,
    {
      requestWidth: full,
      descriptorWidth: Math.min(width, full),
    },
  ]
}

export function zoomImageSources({
  src,
  dimensions,
  sizes = PLAIN_ZOOM_IMAGE_SIZES,
}: {
  src: string | null | undefined
  dimensions: ImageDimensions | null | undefined
  sizes?: string
}): ZoomImageSource | null {
  if (!src || !dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return null
  }
  if (!isOptimizablePublicImage(src)) return null

  const candidates = zoomImageCandidates(dimensions.width)
  const full = candidates[candidates.length - 1]

  return {
    src: optimizedImageSrc(src, full.requestWidth),
    srcSet: candidates
      .map(
        ({ requestWidth, descriptorWidth }) =>
          `${optimizedImageSrc(src, requestWidth)} ${descriptorWidth}w`
      )
      .join(', '),
    sizes,
  }
}

export function zoomImageDataAttrs({
  src,
  dimensions,
  sizes = PLAIN_ZOOM_IMAGE_SIZES,
}: {
  src: string
  dimensions?: ImageDimensions | null
  sizes?: string
}): Record<string, string> {
  if (!dimensions) return { 'data-full-src': src }

  return {
    'data-full-src': src,
    'data-full-width': String(dimensions.width),
    'data-full-height': String(dimensions.height),
    'data-full-sizes': sizes,
  }
}
