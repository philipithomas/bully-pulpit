import { getPageBySlug, getPostBySlug } from '@/lib/content/loader'
import type { Page, Post } from '@/lib/content/types'
import { sitePhoneDisplayNumber } from '@/lib/phone/config'
import { stargazingPageContent } from '@/lib/stargazing/restaurants'

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
 * Converts a post or page to the text Bell may quote. The contact page keeps
 * its environment-specific phone number out of the committed content corpus,
 * then adds the active number here for live page reads.
 */
export function toPagePlaintext(
  item: Pick<Page | Post, 'slug' | 'content'>
): string {
  const plain = toPlaintext(item.content)
  if (item.slug === 'stargazing') {
    return toPlaintext(stargazingPageContent(item.content))
  }
  if (item.slug !== 'contact') return plain

  const phoneNumber = sitePhoneDisplayNumber()
  return phoneNumber ? `${plain}\n\nTelephone: ${phoneNumber}` : plain
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
    toPagePlaintext(item) ||
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
