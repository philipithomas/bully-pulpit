import { getImageProps } from 'next/image'
import type { ImageDimensions } from '@/lib/content/types'

/**
 * Sizes the post page renders its cover at. The fallback is a bare vw token:
 * Next only parses `NNvw` (not calc()) when pruning srcset candidates.
 */
export const POST_COVER_SIZES = '(min-width: 1312px) 1280px, 100vw'
const PORTRAIT_TIDBITS_COVER_HEIGHT_SVH = 80

const FALLBACK_DIMENSIONS: ImageDimensions = { width: 1280, height: 640 }

interface CoverPost {
  newsletter?: string
  frontmatter: { coverImage?: string }
  coverDimensions?: ImageDimensions
}

export function isPortraitTidbitsCover(post: CoverPost): boolean {
  return Boolean(
    post.newsletter === 'tidbits' &&
      post.coverDimensions &&
      post.coverDimensions.width < post.coverDimensions.height
  )
}

export function portraitTidbitsCoverMaxWidth(
  post: CoverPost
): string | undefined {
  if (!isPortraitTidbitsCover(post) || !post.coverDimensions) return undefined
  return `${
    (post.coverDimensions.width / post.coverDimensions.height) *
    PORTRAIT_TIDBITS_COVER_HEIGHT_SVH
  }svh`
}

export function postCoverSizes(post: CoverPost): string {
  const portraitMaxWidth = portraitTidbitsCoverMaxWidth(post)
  return portraitMaxWidth
    ? `(max-width: 640px) calc(100vw - 2rem), min(calc(100vw - 4rem), ${portraitMaxWidth})`
    : POST_COVER_SIZES
}

/**
 * Data attributes for a post link so CoverPreload can warm the destination
 * page's cover rendition on hover/focus. Computed with getImageProps using
 * the exact width/sizes the post page will request, so the hover fetch and
 * the navigation fetch hit the same optimized URL.
 */
export function coverPreloadAttrs(post: CoverPost): Record<string, string> {
  const coverImage = post.frontmatter.coverImage
  if (!coverImage) return {}
  const dims = post.coverDimensions ?? FALLBACK_DIMENSIONS
  const sizes = postCoverSizes(post)
  const { props } = getImageProps({
    src: coverImage,
    alt: '',
    width: dims.width,
    height: dims.height,
    sizes,
  })
  if (!props.srcSet) return {}
  return {
    'data-cover-srcset': props.srcSet,
    'data-cover-sizes': props.sizes ?? sizes,
  }
}
