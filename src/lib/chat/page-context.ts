import { getPageBySlug, getPostBySlug } from '@/lib/content/loader'

/** Character budget for injected page content. Roughly 1k tokens. */
export const PAGE_CONTENT_MAX_CHARS = 4000

export interface PageContextContent {
  slug: string
  title: string
  content: string
  truncated: boolean
}

/**
 * Converts MDX source to plain text suitable for system-prompt injection:
 * strips imports, JSX/HTML tags, images, and markdown syntax while keeping
 * the prose intact.
 */
export function toPlaintext(mdx: string): string {
  return mdx
    .replace(/^(import|export)\s[^\n]*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Resolves the visitor's current path to a known post or content page and
 * returns its title and plaintext content for system-prompt injection, so
 * questions about "this page" answer without tool calls. Returns null for
 * the homepage, newsletter indexes, and unknown paths, where the existing
 * search-based guidance applies instead.
 */
export function getPageContextContent(
  path: unknown,
  maxChars: number = PAGE_CONTENT_MAX_CHARS
): PageContextContent | null {
  if (typeof path !== 'string') return null
  const slug = path.replace(/^\//, '').replace(/\/$/, '')
  // Posts and pages are served at root-level /[slug]; nested paths are
  // newsletter indexes, feeds, or app routes.
  if (!slug || slug.includes('/')) return null

  const item = getPostBySlug(slug) ?? getPageBySlug(slug)
  if (!item) return null

  const plain =
    toPlaintext(item.content) ||
    item.frontmatter.coverImageAlt ||
    item.frontmatter.title
  const truncated = plain.length > maxChars
  return {
    slug,
    title: item.frontmatter.title,
    content: truncated ? plain.slice(0, maxChars) : plain,
    truncated,
  }
}
