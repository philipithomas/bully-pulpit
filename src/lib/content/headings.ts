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

export interface RenderedHeading {
  depth: 1 | 2 | 3 | 4 | 5 | 6
  text: string
  slug: string
  /** Zero-based line index in the raw markdown. */
  line: number
}

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.+)$/
const BLOCKQUOTE_PREFIX_RE = /^(?:[ \t]{0,3}>[ \t]?)*/

function structuralLine(line: string): string {
  return line.replace(BLOCKQUOTE_PREFIX_RE, '')
}

/**
 * Removes fenced code blocks (``` or ~~~) so commented # lines inside code
 * never count as headings. An unclosed fence swallows everything after it,
 * matching how it renders.
 */
export function stripCodeFences(markdown: string): string {
  const kept: string[] = []
  let fence: string | null = null
  for (const line of markdown.split('\n')) {
    const match = structuralLine(line).match(FENCE_RE)
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
 * Parses every heading that MDX renders, including headings nested inside
 * blockquotes. Empty-slug headings are retained internally because an h2/h3
 * with no stable id still ends the preceding canonical section.
 */
function parseRenderedHeadings(markdown: string): RenderedHeading[] {
  const slug = createSlugger()
  const headings: RenderedHeading[] = []
  let fence: string | null = null

  const lines = markdown.split('\n')
  for (let line = 0; line < lines.length; line++) {
    const lineStructure = structuralLine(lines[line])
    const fenceMatch = lineStructure.match(FENCE_RE)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (fence === null) fence = marker
      else if (marker === fence) fence = null
      continue
    }
    if (fence !== null) continue

    const match = lineStructure.match(HEADING_RE)
    if (!match) continue
    const depth = match[1].length as RenderedHeading['depth']
    const text = cleanHeadingText(match[2])
    headings.push({ depth, text, slug: slug(text), line })
  }

  return headings
}

/**
 * Returns every stable heading id exactly as rendered by the MDX heading
 * components. Consumers such as fetchPost use this shared parser so their
 * citation outlines cannot drift from selected-passage provenance.
 */
export function extractRenderedHeadings(markdown: string): RenderedHeading[] {
  return parseRenderedHeadings(markdown).filter((heading) => heading.slug)
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
  return parseRenderedHeadings(markdown)
    .filter(
      (heading): heading is RenderedHeading & { depth: 2 | 3 } =>
        (heading.depth === 2 || heading.depth === 3) && Boolean(heading.slug)
    )
    .map(({ depth, text, slug }) => ({ depth, text, slug }))
}

/**
 * Returns the canonical markdown governed by each stable h2/h3. Empty-slug
 * headings still end the previous section, matching the browser's nearest
 * usable heading behavior without becoming link targets themselves.
 */
export function extractHeadingSections(markdown: string): PostHeadingSection[] {
  const sections: PostHeadingSection[] = []
  let current:
    | (PostHeading & {
        lines: string[]
      })
    | null = null
  const headingsByLine = new Map(
    parseRenderedHeadings(markdown).map((heading) => [heading.line, heading])
  )

  const finishCurrent = () => {
    if (!current) return
    sections.push({
      depth: current.depth,
      text: current.text,
      slug: current.slug,
      markdown: current.lines.join('\n').trim(),
    })
  }

  const lines = markdown.split('\n')
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const line = lines[lineNumber]
    const heading = headingsByLine.get(lineNumber)
    if (heading && (heading.depth === 2 || heading.depth === 3)) {
      finishCurrent()
      current = heading.slug
        ? {
            depth: heading.depth,
            text: heading.text,
            slug: heading.slug,
            // Use the rendered heading text for quote matching, then retain
            // the raw body so the shared plaintext path handles Markdown.
            lines: [heading.text],
          }
        : null
      continue
    }
    if (current) current.lines.push(line)
  }
  finishCurrent()
  return sections
}
