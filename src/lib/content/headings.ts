import { createSlugger } from '@/lib/content/slugify'

export interface PostHeading {
  depth: 2 | 3
  text: string
  slug: string
}

export interface PostHeadingSection extends PostHeading {
  /** Raw markdown from this heading through the next h2/h3 boundary. */
  markdown: string
}

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/
const HEADING_RE = /^(#{1,6})\s+(.+)$/

/**
 * Removes fenced code blocks (``` or ~~~) so commented # lines inside code
 * never count as headings. An unclosed fence swallows everything after it,
 * matching how it renders.
 */
export function stripCodeFences(markdown: string): string {
  const kept: string[] = []
  let fence: string | null = null
  for (const line of markdown.split('\n')) {
    const match = line.match(FENCE_RE)
    if (match) {
      const marker = match[1][0]
      if (fence === null) {
        fence = marker
      } else if (marker === fence) {
        fence = null
      }
      continue
    }
    if (fence === null) kept.push(line)
  }
  return kept.join('\n')
}

/**
 * Reduces raw markdown heading text to the plain text the browser renders,
 * so slugs computed here match slugs computed from React children in the
 * MDX heading components: links and images keep their text, JSX tags and
 * inline markers (code, emphasis) drop out.
 */
function cleanHeadingText(raw: string): string {
  return raw
    .replace(/\s+#+\s*$/, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`+/g, '')
    .replace(/(\*{1,3}|_{2,3})([^*_]+)\1/g, '$2')
    .trim()
}

/**
 * Extracts h2/h3 headings with their anchor slugs from raw post markdown.
 * All heading levels feed the slugger (the rendered page gives every
 * heading an id, so deduplication must see the same sequence) but only
 * levels 2 and 3 are returned. Anything that links to anchors from raw
 * markdown (for example Bell citations) computes ids through this path,
 * so it must stay in lockstep with the MDX heading components.
 */
export function extractHeadings(markdown: string): PostHeading[] {
  return extractHeadingSections(markdown).map(
    ({ markdown: _markdown, ...heading }) => heading
  )
}

/**
 * Returns the canonical markdown governed by each stable h2/h3. Empty-slug
 * headings still end the previous section, matching the browser's nearest
 * usable heading behavior without becoming link targets themselves.
 */
export function extractHeadingSections(markdown: string): PostHeadingSection[] {
  const slug = createSlugger()
  const sections: PostHeadingSection[] = []
  let current:
    | (PostHeading & {
        lines: string[]
      })
    | null = null
  let fence: string | null = null

  const finishCurrent = () => {
    if (!current) return
    sections.push({
      depth: current.depth,
      text: current.text,
      slug: current.slug,
      markdown: current.lines.join('\n').trim(),
    })
  }

  for (const line of markdown.split('\n')) {
    const fenceMatch = line.match(FENCE_RE)
    if (fenceMatch) {
      if (current) current.lines.push(line)
      const marker = fenceMatch[1][0]
      if (fence === null) fence = marker
      else if (marker === fence) fence = null
      continue
    }
    if (fence !== null) {
      if (current) current.lines.push(line)
      continue
    }

    const match = line.match(HEADING_RE)
    if (match) {
      const depth = match[1].length
      const text = cleanHeadingText(match[2])
      const id = slug(text)
      if (depth === 2 || depth === 3) {
        finishCurrent()
        current = id
          ? {
              depth,
              text,
              slug: id,
              // Use the rendered heading text for quote matching, then retain
              // the raw body so the shared plaintext path handles Markdown.
              lines: [text],
            }
          : null
        continue
      }
    }
    if (current) current.lines.push(line)
  }
  finishCurrent()
  return sections
}
