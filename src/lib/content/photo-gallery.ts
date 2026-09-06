import type { ZoomGalleryItem } from '@/components/ui/image-zoom-overlay'
import { markdownToPlaintext } from '@/lib/content/render-html'
import type { Post } from '@/lib/content/types'
import {
  CAPTIONED_ZOOM_IMAGE_SIZES,
  IMMERSIVE_ZOOM_IMAGE_SIZES,
  zoomImageSources,
} from '@/lib/content/zoom-image'

/** Server-only serialization shared by direct-post neighbors and the album API. */
export function photoGalleryItemFromPost(post: Post): ZoomGalleryItem {
  const { frontmatter, coverDimensions } = post
  const originalSrc = frontmatter.coverImage ?? ''
  const sources = zoomImageSources({
    src: originalSrc,
    dimensions: coverDimensions,
    sizes:
      post.newsletter === 'tidbits'
        ? IMMERSIVE_ZOOM_IMAGE_SIZES
        : CAPTIONED_ZOOM_IMAGE_SIZES,
  })
  const preview = zoomImageSources({
    src: originalSrc,
    dimensions: coverDimensions
      ? { ...coverDimensions, width: Math.min(coverDimensions.width, 1200) }
      : null,
  })
  const description = (
    frontmatter.description ?? markdownToPlaintext(post.content, 901)
  ).trim()
  return {
    src: preview?.src ?? originalSrc,
    originalSrc,
    fullSrc: sources?.src ?? originalSrc,
    fullSrcSet: sources?.srcSet ?? null,
    fullSizes: sources?.sizes ?? null,
    alt: frontmatter.coverImageAlt ?? frontmatter.title,
    width: coverDimensions?.width ?? null,
    height: coverDimensions?.height ?? null,
    caption: {
      href: `/${encodeURIComponent(post.slug)}`,
      title: frontmatter.title,
      description:
        description.length > 900
          ? `${description.slice(0, 900).trimEnd()}...`
          : description,
      date: frontmatter.publishedAt,
      locationName: frontmatter.location?.name ?? null,
      locationUrl: frontmatter.location?.url ?? null,
      photo: frontmatter.photo ?? null,
      presentation: post.newsletter === 'tidbits' ? 'immersive' : 'rail',
      collection: post.newsletter === 'tidbits' ? 'tidbits' : 'tsundoku',
    },
  }
}
