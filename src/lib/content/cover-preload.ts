import { getImageProps } from 'next/image'
import type { ImageDimensions } from '@/lib/content/types'

/**
 * Sizes the post page renders its cover at. The fallback is a bare vw token:
 * Next only parses `NNvw` (not calc()) when pruning srcset candidates.
 */
export const POST_COVER_SIZES = '(min-width: 1312px) 1280px, 100vw'

const FALLBACK_DIMENSIONS: ImageDimensions = { width: 1280, height: 640 }

/**
 * Data attributes for a post link so CoverPreload can warm the destination
 * page's cover rendition on hover/focus. Computed with getImageProps using
 * the exact width/sizes the post page will request, so the hover fetch and
 * the navigation fetch hit the same optimized URL.
 */
export function coverPreloadAttrs(post: {
  frontmatter: { coverImage?: string }
  coverDimensions?: ImageDimensions
}): Record<string, string> {
  const coverImage = post.frontmatter.coverImage
  if (!coverImage) return {}
  const dims = post.coverDimensions ?? FALLBACK_DIMENSIONS
  const { props } = getImageProps({
    src: coverImage,
    alt: '',
    width: dims.width,
    height: dims.height,
    sizes: POST_COVER_SIZES,
  })
  if (!props.srcSet) return {}
  return {
    'data-cover-srcset': props.srcSet,
    'data-cover-sizes': props.sizes ?? POST_COVER_SIZES,
  }
}
