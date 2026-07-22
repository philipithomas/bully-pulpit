import type { Newsletter, Post } from '@/lib/content/types'

/**
 * Editorial priority for posts published on the same calendar day.
 * Lower numbers sort first.
 */
export const NEWSLETTER_SAME_DAY_PRIORITY = {
  contraption: 0,
  postcard: 1,
  workshop: 2,
  tidbits: 3,
  tsundoku: 4,
} as const satisfies Record<Newsletter, number>

/** Canonical newest-first ordering for aggregate post lists. */
export function comparePostsNewestFirst(a: Post, b: Post): number {
  const dateDiff =
    new Date(b.frontmatter.publishedAt).getTime() -
    new Date(a.frontmatter.publishedAt).getTime()
  if (dateDiff !== 0) return dateDiff

  const newsletterDiff =
    NEWSLETTER_SAME_DAY_PRIORITY[a.newsletter] -
    NEWSLETTER_SAME_DAY_PRIORITY[b.newsletter]
  if (newsletterDiff !== 0) return newsletterDiff

  const sequenceDiff =
    (b.frontmatter.sequence ?? 0) - (a.frontmatter.sequence ?? 0)
  if (sequenceDiff !== 0) return sequenceDiff

  return a.slug.localeCompare(b.slug)
}
