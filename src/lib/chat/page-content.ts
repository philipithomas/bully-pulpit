import { toPlaintext } from '@/lib/chat/page-context'
import { siteConfig } from '@/lib/config'
import {
  getPageBySlug,
  getPostBySlug,
  getPostsByNewsletter,
} from '@/lib/content/loader'
import { NEWSLETTERS, type Newsletter } from '@/lib/content/types'

/** Character budget for a fetchPage response. Roughly 1k tokens. */
export const PAGE_TEXT_MAX_CHARS = 4000

const NOT_FOUND =
  'No page exists at that path. Use searchPosts to find content instead.'

// Mirrors the homepage copy in src/app/page.tsx and the newsletter taglines
// in src/lib/config.ts. Update this summary alongside that copy.
const HOMEPAGE_SUMMARY = `The homepage of philipithomas.com, the personal website and blog of Philip I. Thomas. Philip crafts digital tools. He is an engineer based in New York City, working at the intersection of math, software, and business. He is interested in urbanism, coffee, and photography. He does not use social media, so this website contains his writing and media. Visitors can connect with him on GitHub and LinkedIn.

He publishes four newsletters:
- Contraption (/contraption): Projects and essays.
- Workshop (/workshop): Journal about work in progress.
- Postcard (/postcard): What I'm up to.
- Tsundoku (/tsundoku): Pop-up photography newsletter.

The newsletters are available by email, RSS, or snail mail, and the homepage has a signup form.`

function newsletterIndexText(newsletter: Newsletter): string {
  const config = siteConfig.newsletters[newsletter]
  const recent = getPostsByNewsletter(newsletter)
    .slice(0, 5)
    .map(
      (post) =>
        `- ${post.frontmatter.title} (${post.frontmatter.publishedAt}, /${post.slug})`
    )
  return [
    `${config.name} (/${config.slug}): ${config.tagline}`,
    '',
    'Most recent posts:',
    ...recent,
  ].join('\n')
}

function resolvePath(path: string): string {
  if (!path.startsWith('/')) return NOT_FOUND
  const slug = path.replace(/^\//, '').replace(/\/$/, '')
  if (slug === '') return HOMEPAGE_SUMMARY
  // Nested paths are feeds or app routes with no readable text
  if (slug.includes('/')) return NOT_FOUND

  if ((NEWSLETTERS as readonly string[]).includes(slug)) {
    return newsletterIndexText(slug as Newsletter)
  }

  const item = getPostBySlug(slug) ?? getPageBySlug(slug)
  if (!item) return NOT_FOUND
  return `${item.frontmatter.title}\n\n${toPlaintext(item.content)}`
}

/**
 * Resolves a site path to readable plain text for the fetchPage tool: the
 * homepage summary, a newsletter index with its most recent posts, or the
 * plaintext of a root-level post or content page. Never throws. Unknown
 * paths and read failures return a short not-found message, and every
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
