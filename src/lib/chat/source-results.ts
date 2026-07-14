export type BellSourceType = 'post' | 'page' | 'image'

export interface BellSource {
  type: BellSourceType
  title: string
  url: string
  publishedAt?: string
  newsletter?: string
  section?: string
}

const MAX_BELL_SOURCES = 6
const SOURCE_NEWSLETTERS = new Set([
  'contraption',
  'workshop',
  'postcard',
  'tsundoku',
  'page',
])

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function parseOutput(output: unknown): unknown {
  if (typeof output !== 'string') return output
  try {
    return JSON.parse(output) as unknown
  } catch {
    return null
  }
}

function shortText(value: unknown, maxLength = 200): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return undefined
  return trimmed
}

function internalUrl(value: unknown): string | undefined {
  const candidate = shortText(value, 500)
  const hasControlCharacter = candidate
    ? [...candidate].some((character) => {
        const code = character.charCodeAt(0)
        return code <= 31 || code === 127
      })
    : false
  if (
    !candidate?.startsWith('/') ||
    candidate.startsWith('//') ||
    hasControlCharacter
  ) {
    return undefined
  }
  return candidate
}

function publishedAt(value: unknown): string | undefined {
  const candidate = shortText(value, 40)
  return candidate && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(candidate)
    ? candidate.slice(0, 10)
    : undefined
}

function sourceType(
  value: unknown,
  newsletter: string | undefined
): BellSourceType {
  if (value === 'page' || value === 'image' || value === 'post') return value
  return newsletter === 'page' ? 'page' : 'post'
}

function firstSection(result: UnknownRecord): {
  heading: string
  url: string
} | null {
  const candidates: unknown[] = []
  if (Array.isArray(result.excerpts)) {
    for (const excerpt of result.excerpts) {
      const excerptRecord = record(excerpt)
      if (excerptRecord) candidates.push(excerptRecord.section)
    }
  }
  const image = record(result.image)
  if (image) candidates.push(image.section)

  for (const candidate of candidates) {
    const section = record(candidate)
    const heading = shortText(section?.heading)
    const url = internalUrl(section?.url)
    if (heading && url) return { heading, url }
  }
  return null
}

function sourceFromRecord(
  result: UnknownRecord,
  fallbackUrl?: string
): BellSource | null {
  if (typeof result.error === 'string') return null
  const title = shortText(result.title)
  const url = internalUrl(result.url) ?? internalUrl(fallbackUrl)
  if (!title || !url) return null

  const newsletter = shortText(result.newsletter, 40)
  const section = firstSection(result)
  const date = publishedAt(result.publishedAt)
  return {
    type: sourceType(result.type, newsletter),
    title,
    url: section?.url ?? url,
    ...(date ? { publishedAt: date } : {}),
    ...(newsletter ? { newsletter } : {}),
    ...(section ? { section: section.heading } : {}),
  }
}

function currentPageSourceFromMetadata(metadata: unknown): BellSource | null {
  const source = record(record(metadata)?.currentPageSource)
  if (!source || (source.type !== 'post' && source.type !== 'page')) return null

  const title = shortText(source.title)
  const url = internalUrl(source.url)
  if (!title || !url || !/^\/(?:[a-z0-9-]+)?$/.test(url)) return null

  const newsletter = shortText(source.newsletter, 40)
  if (!newsletter || !SOURCE_NEWSLETTERS.has(newsletter)) return null

  if (!Object.hasOwn(source, 'publishedAt')) return null
  const date =
    source.publishedAt === null ? undefined : publishedAt(source.publishedAt)
  if (
    source.publishedAt !== null &&
    (typeof source.publishedAt !== 'string' ||
      !date ||
      source.publishedAt !== date)
  ) {
    return null
  }
  if (source.type === 'post' && (!date || newsletter === 'page')) return null

  return {
    type: source.type,
    title,
    url,
    ...(date ? { publishedAt: date } : {}),
    newsletter,
  }
}

function fallbackUrlForTool(
  toolName: string,
  input: UnknownRecord | null
): string | undefined {
  if (toolName === 'fetchPost') {
    const slug = shortText(input?.slug, 200)
    return slug && /^[a-z0-9][a-z0-9-]*$/.test(slug) ? `/${slug}` : undefined
  }
  if (toolName === 'fetchPage') return internalUrl(input?.path)
  return undefined
}

export function bellSourcesFromToolOutput(
  toolName: string,
  output: unknown,
  input?: unknown
): BellSource[] {
  const parsed = parseOutput(output)
  const container = record(parsed)
  const results =
    toolName === 'listPosts' && Array.isArray(container?.posts)
      ? container.posts
      : Array.isArray(parsed)
        ? parsed
        : [parsed]
  const fallbackUrl = fallbackUrlForTool(toolName, record(input))
  return results
    .map(record)
    .filter((result): result is UnknownRecord => result !== null)
    .map((result) => sourceFromRecord(result, fallbackUrl))
    .filter((source): source is BellSource => source !== null)
}

/**
 * Collects provenance only from completed Bell tools. Sources sharing a page
 * collapse to the richer section-anchored result so repeated search/read
 * steps do not fill the narrow chat panel with duplicates.
 */
export function bellSourcesFromMessageParts(
  parts: readonly unknown[]
): BellSource[] {
  const byPage = new Map<string, BellSource>()

  for (const value of parts) {
    const part = record(value)
    const type = shortText(part?.type, 80)
    if (
      !part ||
      !type?.startsWith('tool-') ||
      part.state !== 'output-available'
    ) {
      continue
    }

    for (const source of bellSourcesFromToolOutput(
      type.slice('tool-'.length),
      part.output,
      part.input
    )) {
      const page = source.url.split('#')[0]
      const previous = byPage.get(page)
      if (!previous || (!previous.section && source.section)) {
        byPage.set(page, source)
      }
    }
  }

  return [...byPage.values()].slice(0, MAX_BELL_SOURCES)
}

/**
 * Uses completed tool provenance when the model fetched or searched. A
 * server-attached current-page source is the deterministic fallback for a
 * no-tool answer. Client-replayed metadata is never trusted: every field is
 * revalidated before it can become a link or analytics dimension.
 */
export function bellSourcesFromMessage(message: {
  parts: readonly unknown[]
  metadata?: unknown
}): BellSource[] {
  const toolSources = bellSourcesFromMessageParts(message.parts)
  if (toolSources.length > 0) return toolSources

  const currentPageSource = currentPageSourceFromMetadata(message.metadata)
  return currentPageSource ? [currentPageSource] : []
}
