import { getPageBySlug, getPostBySlug } from '@/lib/content/loader'
import { photoMetadataLabeledText } from '@/lib/content/photo-metadata'
import {
  NEWSLETTERS,
  type Newsletter,
  type Page,
  type Post,
} from '@/lib/content/types'
import { sitePhoneDisplayNumber } from '@/lib/phone/config'
import { findPublicAppPage, publicAppPageBellText } from '@/lib/public-pages'
import { stargazingPageContent } from '@/lib/stargazing/restaurants'

/** Character budget for injected page content. Roughly 1k tokens. */
export const PAGE_CONTENT_MAX_CHARS = 4000

export interface PageContextSource {
  type: 'post' | 'page'
  title: string
  url: string
  publishedAt: string | null
  newsletter: Newsletter | 'page'
}

export interface PageContextContent {
  slug: string
  title: string
  content: string
  truncated: boolean
  /** Server-resolved metadata used for a deterministic client-side source. */
  source: PageContextSource
  /** App pages use fetchPage, rather than fetchPost, for trusted provenance. */
  fetchPath?: string
}

function appPageNewsletter(path: string): Newsletter | 'page' {
  const slug = path.replace(/^\//, '')
  return (NEWSLETTERS as readonly string[]).includes(slug)
    ? (slug as Newsletter)
    : 'page'
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
  item: Pick<Page | Post, 'slug' | 'content' | 'frontmatter'>
): string {
  const plain = toPlaintext(item.content)
  if (item.slug === 'stargazing') {
    return toPlaintext(stargazingPageContent(item.content))
  }
  const photo = photoMetadataLabeledText(item.frontmatter.photo)
  const content = [photo ? `Photo metadata: ${photo}` : '', plain]
    .filter(Boolean)
    .join('\n\n')
  if (item.slug !== 'contact') return content

  const phoneNumber = sitePhoneDisplayNumber()
  return phoneNumber ? `${content}\n\nTelephone: ${phoneNumber}` : content
}

/**
 * Resolves the visitor's current path to a registered app page, post, or
 * content page and returns readable text for system-prompt injection. This
 * improves answer quality while the system prompt still requires a trusted
 * fetchPage or fetchPost call before prose that relies on the page.
 */
export function getPageContextContent(
  path: unknown,
  maxChars: number = PAGE_CONTENT_MAX_CHARS
): PageContextContent | null {
  if (typeof path !== 'string') return null
  const appPage = findPublicAppPage(path)
  if (appPage) {
    const plain = publicAppPageBellText(appPage)
    return {
      slug: appPage.id,
      title: appPage.title,
      content: plain.slice(0, maxChars),
      truncated: plain.length > maxChars,
      source: {
        type: 'page',
        title: appPage.title,
        url: appPage.path,
        publishedAt: null,
        newsletter: appPageNewsletter(appPage.path),
      },
      fetchPath: appPage.path,
    }
  }

  const slug = path.replace(/^\//, '').replace(/\/$/, '')
  // Posts and pages are served at root-level /[slug]; nested paths are
  // newsletter indexes, feeds, or app routes.
  if (!slug || slug.includes('/')) return null

  const post = getPostBySlug(slug)
  const item = post ?? getPageBySlug(slug)
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
    source: {
      type: post ? 'post' : 'page',
      title: item.frontmatter.title,
      url: `/${slug}`,
      publishedAt: item.frontmatter.publishedAt ?? null,
      newsletter: post?.newsletter ?? 'page',
    },
  }
}
