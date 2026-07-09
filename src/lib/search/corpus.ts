import { getAllPosts, getPages } from '@/lib/content/loader'
import type { Frontmatter, Page, Post } from '@/lib/content/types'
import { type PublicAppPage, publicAppPages } from '@/lib/public-pages'
import { createHeadingSlugger } from '@/lib/search/heading-anchor'
import { stargazingPageContent } from '@/lib/stargazing/restaurants'

/**
 * Deterministic chunker over all posts. The chunks here are the single source
 * of truth for everything search-related: the committed vector index hashes
 * and embeds exactly these texts, the lexical (BM25) index concatenates them,
 * and excerpt extraction reads them back. Pure functions of post content —
 * no timestamps, no randomness — so the merkle verification in
 * scripts/check-content.ts can recompute them offline and byte-compare.
 *
 * Chunk hashes (merkle.ts) commit to chunk TEXT only. The heading metadata
 * added here for section citations is hash-transparent: changing how
 * headings are attached can never invalidate the committed vector index.
 */

export type ChunkKind = 'title' | 'body' | 'cover-alt'
export type ImageAssetKind = 'cover-image' | 'body-image'
export type SearchContentType = 'post' | 'page'

/** The heading a chunk sits under, for /slug#anchor section citations. */
export interface ChunkHeading {
  text: string
  /** GitHub-style anchor, deduped in document order (heading-anchor.ts) */
  anchor: string
}

export interface PostChunk {
  /** Sequence within the post; chunk id is `${slug}#${seq}` */
  seq: number
  kind: ChunkKind
  text: string
  /** Nearest heading at or above this chunk's first block, when one exists */
  heading?: ChunkHeading
}

export interface CorpusImageAsset {
  /** Stable within the post; stored in the committed index */
  id: string
  /** Sequence among searchable images in this post */
  seq: number
  kind: ImageAssetKind
  src: string
  alt: string
  /** Deterministic textual description embedded alongside the image bytes */
  text: string
  /** Present for body images below a heading */
  heading?: ChunkHeading
  /** Optional SHA-256 over the public image file for offline index checks */
  sourceHash?: string
}

export interface CorpusPost {
  contentType: SearchContentType
  slug: string
  title: string
  url: string
  newsletter: string
  description: string
  coverImage: string
  coverAlt: string
  chunks: PostChunk[]
  images: CorpusImageAsset[]
}

interface ChunkableContent {
  frontmatter: Frontmatter
  content: string
}

/** Soft maximum chunk size; single oversize paragraphs are split on sentences. */
export const MAX_CHUNK_CHARS = 1200

const HEADING_RE = /^#{1,6}\s/
const PUBLIC_IMAGE_RE = /^\/images\/.+\.(?:avif|gif|jpe?g|png|webp)$/i

/**
 * Strips MDX/JSX tags and markdown syntax to plain text. Unlike
 * markdownToPlaintext in render-html.ts, this keeps inline code and image alt
 * text (both are searchable content) and never truncates.
 */
export function stripToPlaintext(markdown: string): string {
  return markdown
    .replace(/<\/?[A-Za-z][^>]*\/?>/g, ' ') // MDX components / raw HTML tags
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images: keep alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links: keep text
    .replace(/^#{1,6}\s+/gm, '') // heading markers
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2') // bold/italic
    .replace(/`([^`]*)`/g, '$1') // inline code: keep content
    .replace(/^(?:[-*+]|\d+\.)\s+/gm, '') // list markers
    .replace(/^>\s*/gm, '') // blockquotes
    .replace(/^---+$/gm, '') // horizontal rules
    .replace(/\s+/g, ' ')
    .trim()
}

interface Block {
  text: string
  isHeading: boolean
  /** Zero-based line index of the block's first line in the raw markdown */
  startLine: number
}

/**
 * Splits markdown into blocks (paragraphs, headings, list groups), keeping
 * fenced code blocks intact even when they contain blank lines. Fence marker
 * lines are dropped; code content is kept as searchable text.
 */
function splitBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  let current: string[] = []
  let startLine = 0
  let inFence = false

  const flush = () => {
    if (current.length === 0) return
    const raw = current.join('\n')
    const text = stripToPlaintext(raw)
    if (text.length > 0) {
      blocks.push({ text, isHeading: HEADING_RE.test(raw), startLine })
    }
    current = []
  }

  const lines = markdown.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (!inFence && line.trim().length === 0) {
      flush()
      continue
    }
    if (current.length === 0) startLine = i
    current.push(line)
  }
  flush()

  return blocks
}

export interface PostHeading {
  text: string
  anchor: string
  /** Zero-based line index in the raw markdown */
  line: number
}

/**
 * All headings of a markdown document in order, with their GitHub-style
 * anchors deduped in document order. Fence-aware with the same toggle as
 * splitBlocks, so a `# comment` inside a code block never counts. Shared by
 * the chunker (section attribution) and the fetchPost tool (outline) so the
 * anchors the agent cites always agree.
 */
export function extractHeadings(markdown: string): PostHeading[] {
  const headings: PostHeading[] = []
  const slugger = createHeadingSlugger()
  let inFence = false

  const lines = markdown.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence || !HEADING_RE.test(line)) continue
    const text = stripToPlaintext(line)
    if (text.length === 0) continue
    headings.push({ text, anchor: slugger(text), line: i })
  }

  return headings
}

export interface CorpusOptions {
  /** Optional SHA-256 over each public image, supplied by offline scripts. */
  imageDigest?: (src: string) => string | undefined
}

function lineAtIndex(text: string, index: number): number {
  let line = 0
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) line++
  }
  return line
}

function normalizeImageSrc(raw: string): string {
  const trimmed = raw.trim()
  const withoutAngleBrackets =
    trimmed.startsWith('<') && trimmed.endsWith('>')
      ? trimmed.slice(1, -1).trim()
      : trimmed
  const withoutTitle = withoutAngleBrackets.match(/^(\S+)/)?.[1] ?? ''
  return withoutTitle.replace(/[#?].*$/, '')
}

function stringAttr(tag: string, name: string): string | undefined {
  const attr = tag.match(
    new RegExp(
      `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*"([^"]*)"\\s*\\}|\\{\\s*'([^']*)'\\s*\\}|\\{\\s*\\\`([^\\\`]*)\\\`\\s*\\})`,
      'i'
    )
  )
  return attr
    ? (attr[1] ?? attr[2] ?? attr[3] ?? attr[4] ?? attr[5] ?? '').trim()
    : undefined
}

function headingAtLine(
  headings: PostHeading[],
  line: number
): ChunkHeading | undefined {
  let current: PostHeading | undefined
  for (const heading of headings) {
    if (heading.line > line) break
    current = heading
  }
  return current ? { text: current.text, anchor: current.anchor } : undefined
}

function imageText({
  post,
  kind,
  alt,
  heading,
}: {
  post: Post
  kind: ImageAssetKind
  alt: string
  heading?: ChunkHeading
}): string {
  const role = kind === 'cover-image' ? 'cover image' : 'embedded image'
  return [
    `Post: ${post.frontmatter.title}`,
    `Newsletter: ${post.newsletter}`,
    `Image role: ${role}`,
    heading ? `Section: ${heading.text}` : null,
    `Description: ${alt || post.frontmatter.title}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n')
}

/** Extracts searchable public images referenced by a post. */
export function extractImageAssets(
  post: Post,
  options: CorpusOptions = {}
): CorpusImageAsset[] {
  const assets: CorpusImageAsset[] = []
  let seq = 0

  const addAsset = ({
    id,
    kind,
    src,
    alt,
    heading,
  }: {
    id: string
    kind: ImageAssetKind
    src: string
    alt: string
    heading?: ChunkHeading
  }) => {
    if (!PUBLIC_IMAGE_RE.test(src)) return
    const text = imageText({ post, kind, alt, heading })
    const sourceHash = options.imageDigest?.(src)
    assets.push({
      id,
      seq: seq++,
      kind,
      src,
      alt,
      text,
      ...(heading ? { heading } : {}),
      ...(sourceHash ? { sourceHash } : {}),
    })
  }

  if (post.frontmatter.coverImage) {
    addAsset({
      id: 'cover',
      kind: 'cover-image',
      src: post.frontmatter.coverImage,
      alt: post.frontmatter.coverImageAlt ?? post.frontmatter.title,
    })
  }

  const headings = extractHeadings(post.content)
  let bodyIndex = 0
  for (const match of post.content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
    const alt = stripToPlaintext(match[1] ?? '')
    const src = normalizeImageSrc(match[2] ?? '')
    const line = lineAtIndex(post.content, match.index ?? 0)
    addAsset({
      id: `body-${bodyIndex++}`,
      kind: 'body-image',
      src,
      alt,
      heading: headingAtLine(headings, line),
    })
  }

  for (const match of post.content.matchAll(/<(img|Image)\b[^>]*?\/?>/gi)) {
    const tag = match[0]
    const src = normalizeImageSrc(stringAttr(tag, 'src') ?? '')
    const alt = stripToPlaintext(stringAttr(tag, 'alt') ?? '')
    const line = lineAtIndex(post.content, match.index ?? 0)
    addAsset({
      id: `body-${bodyIndex++}`,
      kind: 'body-image',
      src,
      alt,
      heading: headingAtLine(headings, line),
    })
  }

  return assets
}

/** Splits a single oversize block on sentence boundaries, hard-cut fallback. */
function splitLongText(text: string, max: number): string[] {
  if (text.length <= max) return [text]
  const sentences = text.match(/[^.!?]*[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text]
  const parts: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (current.length > 0 && current.length + sentence.length > max) {
      parts.push(current.trim())
      current = ''
    }
    // A single sentence longer than max gets hard-cut
    let s = sentence
    while (s.length > max) {
      parts.push(s.slice(0, max).trim())
      s = s.slice(max)
    }
    current += s
  }
  if (current.trim().length > 0) parts.push(current.trim())
  return parts
}

interface BodyChunk {
  text: string
  heading?: ChunkHeading
}

/**
 * Groups blocks into body chunks of roughly MAX_CHUNK_CHARS, preferring
 * breaks at headings so heading text stays with the content it introduces.
 * Each chunk records the heading governing its first block (the nearest
 * heading at or above it), so search results can cite /slug#anchor sections.
 * Chunk TEXT construction is untouched by heading attribution: hashes over
 * the text cannot move when anchors change.
 */
function groupBlocks(blocks: Block[], headings: PostHeading[]): BodyChunk[] {
  const chunks: BodyChunk[] = []
  let current = ''
  let currentHeading: ChunkHeading | undefined

  const flush = () => {
    if (current.length > 0) {
      for (const text of splitLongText(current, MAX_CHUNK_CHARS)) {
        chunks.push(
          currentHeading ? { text, heading: currentHeading } : { text }
        )
      }
      current = ''
    }
  }

  // Index into headings: all headings before it start at or above the block
  // being processed. Blocks and headings are both in document order.
  let nextHeading = 0
  for (const block of blocks) {
    if (block.isHeading && current.length > 0) flush()
    if (
      current.length > 0 &&
      current.length + block.text.length + 1 > MAX_CHUNK_CHARS
    ) {
      flush()
    }
    while (
      nextHeading < headings.length &&
      headings[nextHeading].line <= block.startLine
    ) {
      nextHeading++
    }
    if (current.length === 0) {
      const governing = nextHeading > 0 ? headings[nextHeading - 1] : undefined
      currentHeading = governing
        ? { text: governing.text, anchor: governing.anchor }
        : undefined
    }
    current = current.length > 0 ? `${current}\n${block.text}` : block.text
  }
  flush()

  return chunks
}

function chunkContent(item: ChunkableContent): PostChunk[] {
  const chunks: PostChunk[] = []
  let seq = 0

  const titleText = [
    item.frontmatter.title,
    item.frontmatter.subtitle ?? item.frontmatter.description ?? '',
  ]
    .filter(Boolean)
    .join('. ')
  chunks.push({ seq: seq++, kind: 'title', text: titleText })

  for (const { text, heading } of groupBlocks(
    splitBlocks(item.content),
    extractHeadings(item.content)
  )) {
    chunks.push(
      heading
        ? { seq: seq++, kind: 'body', text, heading }
        : { seq: seq++, kind: 'body', text }
    )
  }

  if (item.frontmatter.coverImageAlt) {
    chunks.push({
      seq: seq++,
      kind: 'cover-alt',
      text: item.frontmatter.coverImageAlt,
    })
  }

  return chunks
}

/** Builds the deterministic chunk list for one post. */
export function chunkPost(post: Post): PostChunk[] {
  return chunkContent(post)
}

/** Builds the deterministic chunk list for one content page. */
export function chunkPage(page: Page): PostChunk[] {
  if (page.slug !== 'stargazing') return chunkContent(page)
  return chunkContent({
    ...page,
    content: stargazingPageContent(page.content),
  })
}

/** Builds deterministic text chunks for an App Router page registry entry. */
export function chunkPublicAppPage(page: PublicAppPage): PostChunk[] {
  const titleText = [page.title, page.description].filter(Boolean).join('. ')
  const searchText = stripToPlaintext(page.searchText)
  return [
    { seq: 0, kind: 'title', text: titleText },
    ...(searchText
      ? [{ seq: 1, kind: 'body' as const, text: searchText }]
      : []),
  ]
}

export function buildCorpusFromPosts(
  posts: Post[],
  options: CorpusOptions = {}
): CorpusPost[] {
  return posts.map((post) => ({
    contentType: 'post',
    slug: post.slug,
    title: post.frontmatter.title,
    url: `/${post.slug}`,
    newsletter: post.newsletter,
    description:
      post.frontmatter.subtitle ?? post.frontmatter.description ?? '',
    coverImage: post.frontmatter.coverImage ?? '',
    coverAlt: post.frontmatter.coverImageAlt ?? '',
    chunks: chunkPost(post),
    images: extractImageAssets(post, options),
  }))
}

export function buildCorpusFromPages(pages: Page[]): CorpusPost[] {
  return pages.map((page) => ({
    contentType: 'page',
    slug: page.slug,
    title: page.frontmatter.title,
    url: `/${page.slug}`,
    newsletter: 'page',
    description:
      page.frontmatter.subtitle ?? page.frontmatter.description ?? '',
    coverImage: page.frontmatter.coverImage ?? '',
    coverAlt: page.frontmatter.coverImageAlt ?? '',
    chunks: chunkPage(page),
    images: [],
  }))
}

export function buildCorpusFromPublicAppPages(
  pages: readonly PublicAppPage[] = publicAppPages
): CorpusPost[] {
  return pages.map((page) => ({
    contentType: 'page',
    slug: page.id,
    title: page.title,
    url: page.path,
    newsletter: 'page',
    description: page.description,
    coverImage: '',
    coverAlt: '',
    chunks: chunkPublicAppPage(page),
    images: [],
  }))
}

/** Builds the corpus for posts, content pages, and registered app pages. */
export function buildCorpus(options: CorpusOptions = {}): CorpusPost[] {
  return [
    ...buildCorpusFromPosts(getAllPosts(), options),
    ...buildCorpusFromPages(getPages()),
    ...buildCorpusFromPublicAppPages(),
  ]
}
