import {
  collapsePlainTextWhitespace,
  isPassageSelectableContent,
  isSelectedPassageAction,
  normalizeSelectedPassage,
  type SelectedPassageAction,
} from '@/lib/chat/selected-passage'
import {
  type CollectionEntry,
  collectionEntryAnchor,
  getCollection,
  isCollectionSlug,
} from '@/lib/collections'
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

function stripMarkupTags(value: string): string {
  let plaintext = ''
  let index = 0

  while (index < value.length) {
    if (value[index] === '<') {
      const tagEnd = value.indexOf('>', index + 1)
      index = tagEnd === -1 ? index + 1 : tagEnd + 1
      continue
    }
    plaintext += value[index]
    index += 1
  }

  return plaintext
}

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
  entryAnchor?: string
  source: SelectedPassageSource
}

function appPageNewsletter(path: string): Newsletter | 'page' {
  const slug = path.replace(/^\//, '')
  return (NEWSLETTERS as readonly string[]).includes(slug)
    ? (slug as Newsletter)
    : 'page'
}

function imageDescription(alt: string): string {
  const description = alt.trim()
  return description ? `\n\nImage description: ${description}\n\n` : ''
}

/** Skip one complete quoted value or balanced JSX expression. */
function delimitedValueEnd(value: string, start: number): number {
  let quote = ''
  let depth = 0
  for (let index = start; index < value.length; index += 1) {
    const character = value[index]
    if (quote) {
      if (character === '\\') index += 1
      else if (character === quote) {
        quote = ''
        if (depth === 0) return index + 1
      }
    } else if ('"\'`'.includes(character)) quote = character
    else if (character === '{') depth += 1
    else if (character === '}' && --depth === 0) return index + 1
  }
  return value.length
}

function staticImageAlt(tag: string): string {
  // Only inspect top-level attributes. Unsupported expressions must still be
  // consumed whole so a string inside another attribute cannot supply alt.
  let index = 0
  while (index < tag.length) {
    const attribute = /^\s+([\w:-]+)\s*=\s*/.exec(tag.slice(index))
    if (!attribute) {
      index = '"\'{'.includes(tag[index])
        ? delimitedValueEnd(tag, index)
        : index + 1
      continue
    }
    index += attribute[0].length
    const start = index
    if ('"\'{'.includes(tag[index])) index = delimitedValueEnd(tag, index)
    else while (index < tag.length && !/[\s>]/.test(tag[index])) index += 1
    if (attribute[1] !== 'alt') continue
    const literal =
      /^(?:"([^"]*)"|'([^']*)'|\{\s*"((?:\\.|[^"\\])*)"\s*\}|\{\s*'((?:\\.|[^'\\])*)'\s*\})$/.exec(
        tag.slice(start, index)
      )
    if (!literal) return ''
    return (literal[1] ?? literal[2] ?? literal[3] ?? literal[4] ?? '').replace(
      /\\(["'\\])/g,
      '$1'
    )
  }
  return ''
}

function replaceImageTags(mdx: string, includeDescriptions: boolean): string {
  const starts = /<(?:img|Image)\b/g
  let result = ''
  let copiedThrough = 0
  for (let match = starts.exec(mdx); match; match = starts.exec(mdx)) {
    let end = starts.lastIndex
    while (end < mdx.length && mdx[end] !== '>') {
      end = '"\'{'.includes(mdx[end]) ? delimitedValueEnd(mdx, end) : end + 1
    }
    if (end === mdx.length) break
    end += 1
    result += mdx.slice(copiedThrough, match.index)
    if (includeDescriptions) {
      result += imageDescription(staticImageAlt(mdx.slice(match.index, end)))
    }
    copiedThrough = end
    starts.lastIndex = end
  }
  return result + mdx.slice(copiedThrough)
}

/** Strip MDX syntax, optionally retaining authored image descriptions for Bell. */
function plaintextFromMdx(
  mdx: string,
  {
    stripBlockMarkers = false,
    includeImageDescriptions = false,
  }: { stripBlockMarkers?: boolean; includeImageDescriptions?: boolean } = {}
): string {
  const unwrapped = replaceImageTags(mdx, includeImageDescriptions)
    .replace(/^(import|export)\s[^\n]*$/gm, '')
    .replace(
      /!\[((?:\\.|[^\]\\])*)\]\((?:\\.|[^()\\]|\([^()]*\))*\)/g,
      (_match, alt: string) =>
        includeImageDescriptions ? imageDescription(alt) : ''
    )
    .replace(/\[((?:\\.|[^\]\\])*)\]\(#[^)]*\)/g, (_match, text: string) =>
      text.replace(/\\([[\]])/g, '$1')
    )
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')

  const withoutBlockMarkers = stripBlockMarkers
    ? unwrapped
        .replace(/^[\t ]*(?:>[\t ]*)+/gm, '')
        .replace(
          /^ {0,3}(?:(?:-[\t ]*){3,}|(?:\*[\t ]*){3,}|(?:_[\t ]*){3,})\r?$/gm,
          ''
        )
        .replace(/^[\t ]*(?:[-+*]|\d+[.)])[\t ]+/gm, '')
    : unwrapped

  return stripMarkupTags(
    withoutBlockMarkers
      .replace(/(?<!\\)[*_`~]/g, '')
      .replace(/\\(.)/g, (match, character: string) =>
        MARKDOWN_ESCAPABLE_PUNCTUATION.includes(character) ? character : match
      )
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function toPlaintext(mdx: string): string {
  return plaintextFromMdx(mdx, { includeImageDescriptions: true })
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
  if (item.slug !== 'contact') return plain

  const phoneNumber = sitePhoneDisplayNumber()
  return phoneNumber ? `${plain}\n\nTelephone: ${phoneNumber}` : plain
}

export function toPagePlaintext(
  item: Pick<Page | Post, 'slug' | 'content' | 'frontmatter'>
): string {
  const coverAlt = toPlaintext(item.frontmatter.coverImageAlt ?? '')
  const location = toPlaintext(item.frontmatter.location?.name ?? '')
  const photo = photoMetadataLabeledText(item.frontmatter.photo)
  return [
    coverAlt ? `Cover image description: ${coverAlt}` : '',
    location ? `Location: ${location}` : '',
    photo ? `Photo metadata: ${photo}` : '',
    pagePlaintext(item, toPlaintext),
  ]
    .filter(Boolean)
    .join('\n\n')
}

function toRenderedPagePlaintext(
  item: Pick<Page | Post, 'slug' | 'content' | 'frontmatter'>
): string {
  // Selection validation must compare with visible prose, without the cover
  // description or other labeled frontmatter injected into Bell's context.
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

function collectionEntryPlaintext(entry: CollectionEntry): string {
  return [entry.term, entry.definition, entry.reference?.label, entry.suffix]
    .filter(Boolean)
    .join(' ')
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
  const rawEntryAnchor = request.entryAnchor
  const collection = isCollectionSlug(item.slug)
    ? getCollection(item.slug)
    : null
  const candidateEntry =
    collection &&
    typeof rawEntryAnchor === 'string' &&
    rawEntryAnchor.length <= 200
      ? collection.entries.find(
          (entry) => collectionEntryAnchor(entry) === rawEntryAnchor
        )
      : undefined
  const entry =
    candidateEntry &&
    collapsePlainTextWhitespace(
      collectionEntryPlaintext(candidateEntry)
    ).includes(text)
      ? candidateEntry
      : undefined
  const headingSection =
    !entry && typeof rawHeadingId === 'string' && rawHeadingId.length <= 200
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
  const entryAnchor = entry ? collectionEntryAnchor(entry) : undefined
  const sourceUrl = entryAnchor
    ? `${pageContent.source.url}#${entryAnchor}`
    : heading
      ? `${pageContent.source.url}#${heading.slug}`
      : pageContent.source.url
  const sourceSection = entry?.term ?? heading?.text

  return {
    action: request.action,
    text,
    path: currentPath,
    ...(heading ? { headingId: heading.slug, headingText: heading.text } : {}),
    ...(entryAnchor ? { entryAnchor } : {}),
    source: {
      ...pageContent.source,
      url: sourceUrl,
      ...(sourceSection ? { section: sourceSection } : {}),
    },
  }
}
