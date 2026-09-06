import { getPostsByNewsletter } from '@/lib/content/loader'
import { comparePostsNewestFirst } from '@/lib/content/post-order'
import type { Newsletter, Post } from '@/lib/content/types'
import { isPhotoNewsletter } from '@/lib/newsletters'

/** The same newest-first sequence used by photo galleries and their viewers. */
export function getPhotoPosts(newsletter: Newsletter): Post[] {
  if (!isPhotoNewsletter(newsletter)) return []

  return getPostsByNewsletter(newsletter)
    .filter(
      (post) =>
        post.newsletter === newsletter &&
        !post.frontmatter.draft &&
        Boolean(post.frontmatter.publishedAt && post.frontmatter.coverImage) &&
        Boolean(
          post.coverDimensions &&
            Number.isFinite(post.coverDimensions.width) &&
            Number.isFinite(post.coverDimensions.height) &&
            post.coverDimensions.width > 0 &&
            post.coverDimensions.height > 0
        )
    )
    .sort(comparePostsNewestFirst)
}

export interface PhotoNavigation {
  /** Swipe left / move forward through the newest-first gallery. */
  older: Post | null
  /** Swipe right / move backward through the newest-first gallery. */
  newer: Post | null
  total: number
  /** Zero-based position in the full collection, or -1 for a non-photo. */
  index: number
}

/** Circular navigation is deliberately limited to the two photo newsletters. */
export function getPhotoNavigation(post: Post): PhotoNavigation {
  const photos = getPhotoPosts(post.newsletter)
  const index = photos.findIndex((photo) => photo.slug === post.slug)
  if (index === -1) return { older: null, newer: null, total: 0, index: -1 }

  const total = photos.length
  return {
    older: total > 1 ? photos[(index + 1) % total] : null,
    newer: total > 1 ? photos[(index - 1 + total) % total] : null,
    total,
    index,
  }
}
