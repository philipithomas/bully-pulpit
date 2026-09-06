import {
  collapsePlainTextWhitespace,
  isPassageSelectableContent,
  isSelectedPassageAction,
  normalizeSelectedPassage,
  type SelectedPassageAction,
} from '@/lib/chat/selected-passage'
import { extractHeadingSections } from '@/lib/content/headings'
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
const MARKDOWN_ESCAPABLE_PUNCTUATION = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'

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

export interface SelectedPassageSource extends PageContextSource {
  section?: string
}

export interface SelectedPassageContext {
  action: SelectedPassageAction
  text: string
  path: string
  headingId?: string
  headingText?: string
  source: SelectedPassageSource
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
function plaintextFromMdx(
  mdx: string,
  { stripBlockMarkers = false }: { stripBlockMarkers?: boolean } = {}
): string {
  const unwrapped = mdx
    .replace(/^(import|export)\s[^\n]*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[((?:\\.|[^\]\\])*)\]\(#[^)]*\)/g, (_match, text: string) =>
      text.replace(/\\([[\]])/g, '$1')
    )
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^#{1,6}\s+/gm, '')

  const withoutBlockMarkers = stripBlockMarkers
    ? unwrapped
        .replace(/^[\t ]*(?:>[\t ]*)+/gm, '')
        .replace(/^[\t ]*(?:[-+*]|\d+[.)])[\t ]+/gm, '')
    : unwrapped

  return withoutBlockMarkers
    .replace(/(?<!\\)[*_`~]/g, '')
    .replace(/\\(.)/g, (match, character: string) =>
      MARKDOWN_ESCAPABLE_PUNCTUATION.includes(character) ? character : match
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function toPlaintext(mdx: string): string {
  return plaintextFromMdx(mdx)
}

function toRenderedPlaintext(mdx: string): string {
  return plaintextFromMdx(mdx, { stripBlockMarkers: true })
}

/**
 * Converts a post or page to the text Bell may quote. The contact page keeps
 * its environment-specific phone number out of the committed content corpus,
 * then adds the active number here for live page reads.
 */
function pagePlaintext(
  item: Pick<Page | Post, 'slug' | 'content' | 'frontmatter'>,
  convertMdx: (mdx: string) => string
): string {
  const plain = convertMdx(item.content)
  if (item.slug === 'stargazing') {
    return convertMdx(stargazingPageContent(item.content))
  }
  const photo = photoMetadataLabeledText(item.frontmatter.photo)
  const content = [photo ? `Photo metadata: ${photo}` : '', plain]
    .filter(Boolean)
    .join('\n\n')
  if (item.slug !== 'contact') return content

  const phoneNumber = sitePhoneDisplayNumber()
  return phoneNumber ? `${content}\n\nTelephone: ${phoneNumber}` : content
}

export function toPagePlaintext(
  item: Pick<Page | Post, 'slug' | 'content' | 'frontmatter'>
): string {
  return pagePlaintext(item, toPlaintext)
}

function toRenderedPagePlaintext(
  item: Pick<Page | Post, 'slug' | 'content' | 'frontmatter'>
): string {
  return pagePlaintext(item, toRenderedPlaintext)
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

function selectedPassageRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Resolves client passage metadata back to the canonical content corpus. The
 * selected text remains untrusted prompt input, but it receives a source only
 * when its page, quote, and optional stable heading all match server data.
 */
export function getSelectedPassageContext(
  value: unknown,
  currentPath: string | undefined,
  pageContent: PageContextContent | null
): SelectedPassageContext | null {
  const request = selectedPassageRecord(value)
  if (
    !request ||
    !currentPath ||
    !pageContent ||
    pageContent.fetchPath ||
    request.path !== currentPath ||
    pageContent.source.url !== currentPath ||
    !isSelectedPassageAction(request.action)
  ) {
    return null
  }

  const text = normalizeSelectedPassage(request.text)
  if (!text) return null

  const post = getPostBySlug(pageContent.slug)
  const page = post ? null : getPageBySlug(pageContent.slug)
  const item = post ?? page
  if (
    !item ||
    !isPassageSelectableContent(item.slug, post ? 'post' : 'page') ||
    !collapsePlainTextWhitespace(toRenderedPagePlaintext(item)).includes(text)
  ) {
    return null
  }

  const rawHeadingId = request.headingId
  const headingSection =
    typeof rawHeadingId === 'string' && rawHeadingId.length <= 200
      ? extractHeadingSections(item.content).find(
          (candidate) => candidate.slug === rawHeadingId
        )
      : undefined
  const heading =
    headingSection &&
    collapsePlainTextWhitespace(
      toRenderedPlaintext(headingSection.markdown)
    ).includes(text)
      ? headingSection
      : undefined
  const sourceUrl = heading
    ? `${pageContent.source.url}#${heading.slug}`
    : pageContent.source.url

  return {
    action: request.action,
    text,
    path: currentPath,
    ...(heading ? { headingId: heading.slug, headingText: heading.text } : {}),
    source: {
      ...pageContent.source,
      url: sourceUrl,
      ...(heading ? { section: heading.text } : {}),
    },
  }
}
