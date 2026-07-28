import { extractExcerpt } from '@/lib/content/loader'
import type { Page, Post } from '@/lib/content/types'

/**
 * One description contract for HTML metadata, social previews, and JSON-LD.
 * Most older posts predate a frontmatter description, so derive the same
 * bounded excerpt everywhere instead of falling back to the homepage bio.
 */
export function contentDescription(item: Page | Post): string {
  const excerpt = extractExcerpt(item.content, 160).trim()

  return (
    (item.frontmatter.description ?? excerpt) ||
    item.frontmatter.coverImageAlt ||
    item.frontmatter.title
  )
}
