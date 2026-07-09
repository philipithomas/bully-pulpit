import { toPagePlaintext } from '@/lib/chat/page-context'
import { getPageBySlug, getPostBySlug } from '@/lib/content/loader'
import { findPublicAppPage, publicAppPageBellText } from '@/lib/public-pages'

/** Character budget for a fetchPage response. Roughly 1k tokens. */
export const PAGE_TEXT_MAX_CHARS = 4000

const NOT_FOUND =
  'No page exists at that path. Use searchPosts to find content instead.'

function resolvePath(path: string): string {
  if (!path.startsWith('/')) return NOT_FOUND
  const appPage = findPublicAppPage(path)
  if (appPage) return publicAppPageBellText(appPage)

  const slug = path.replace(/^\//, '').replace(/\/$/, '')
  // Nested paths are feeds or app routes with no readable text
  if (slug.includes('/')) return NOT_FOUND

  const item = getPostBySlug(slug) ?? getPageBySlug(slug)
  if (!item) return NOT_FOUND
  return `${item.frontmatter.title}\n\n${toPagePlaintext(item)}`
}

/**
 * Resolves a site path to readable plain text for the fetchPage tool: a
 * registered app page or a root-level post/content page. Never throws.
 * Unknown paths and read failures return a short not-found message, and every
 * response is bounded to maxChars.
 */
export function getPageText(
  path: string,
  maxChars: number = PAGE_TEXT_MAX_CHARS
): string {
  try {
    return resolvePath(path).slice(0, maxChars)
  } catch {
    return NOT_FOUND.slice(0, maxChars)
  }
}
