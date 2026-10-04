import type { WebMCP } from 'webmcp-types'

export const WEBMCP_SEARCH_MAX_CHARACTERS = 300
export const WEBMCP_BELL_QUESTION_MAX_CHARACTERS = 2_000
export const WEBMCP_OUTPUT_MAX_CHARACTERS = 1_500

const WEBMCP_SEARCH_MAX_RESULTS = 5
const WEBMCP_RESULT_TITLE_MAX_CHARACTERS = 120
const WEBMCP_RESULT_SNIPPET_MAX_CHARACTERS = 220

const searchInputSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 2,
      maxLength: WEBMCP_SEARCH_MAX_CHARACTERS,
      description:
        "A focused query about Philip's public writing, photos, places, or website",
    },
    scope: {
      type: 'string',
      enum: ['posts', 'images'],
      description:
        'Use images for photos or places photographed; defaults to posts',
    },
  },
  required: ['query'],
  additionalProperties: false,
} as const

const bellInputSchema = {
  type: 'object',
  properties: {
    question: {
      type: 'string',
      minLength: 1,
      maxLength: WEBMCP_BELL_QUESTION_MAX_CHARACTERS,
      description: "The question to start in the site's visible Bell AI chat",
    },
  },
  required: ['question'],
  additionalProperties: false,
} as const

type SearchScope = 'posts' | 'images'

interface SiteWebMcpDependencies {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  origin: string
  startBellQuestion(question: string): void
}

interface SearchResultSummary {
  title: string
  url: string
  type: 'post' | 'page' | 'image'
  snippet: string
}

interface SearchToolOutput {
  results: SearchResultSummary[]
  hasMore: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key))
}

function boundedString(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number
): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${field} must be a string`)
  }

  const normalized = value.trim()
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new RangeError(
      `${field} must contain between ${minimum} and ${maximum} characters`
    )
  }
  return normalized
}

function parseSearchInput(input: unknown): {
  query: string
  scope: SearchScope
} {
  if (!isRecord(input) || !hasOnlyKeys(input, ['query', 'scope'])) {
    throw new TypeError('Search input must contain only query and scope')
  }

  const query = boundedString(
    input.query,
    'query',
    2,
    WEBMCP_SEARCH_MAX_CHARACTERS
  )
  const scope = input.scope ?? 'posts'
  if (scope !== 'posts' && scope !== 'images') {
    throw new TypeError('scope must be posts or images')
  }

  return { query, scope }
}

function parseBellInput(input: unknown): string {
  if (!isRecord(input) || !hasOnlyKeys(input, ['question'])) {
    throw new TypeError('Bell input must contain only question')
  }

  return boundedString(
    input.question,
    'question',
    1,
    WEBMCP_BELL_QUESTION_MAX_CHARACTERS
  )
}

function truncate(value: string, maximum: number): string {
  if (value.length <= maximum) return value
  return `${value.slice(0, maximum - 1).trimEnd()}…`
}

function sameOriginUrl(value: unknown, origin: string): string | null {
  if (typeof value !== 'string') return null

  try {
    const expectedOrigin = new URL(origin).origin
    const url = new URL(value, `${expectedOrigin}/`)
    return url.origin === expectedOrigin ? url.toString() : null
  } catch {
    return null
  }
}

function searchResultSummary(
  value: unknown,
  origin: string
): SearchResultSummary | null {
  if (!isRecord(value)) return null

  const title =
    typeof value.title === 'string' && value.title.trim()
      ? truncate(value.title.trim(), WEBMCP_RESULT_TITLE_MAX_CHARACTERS)
      : null
  const url = sameOriginUrl(value.url, origin)
  const type =
    value.type === 'post' || value.type === 'page' || value.type === 'image'
      ? value.type
      : null
  const excerpts = Array.isArray(value.excerpts) ? value.excerpts : []
  const firstExcerpt = excerpts.find(
    (excerpt): excerpt is string =>
      typeof excerpt === 'string' && Boolean(excerpt.trim())
  )
  const description =
    typeof value.description === 'string' ? value.description.trim() : ''
  const snippet = truncate(
    firstExcerpt?.trim() || description,
    WEBMCP_RESULT_SNIPPET_MAX_CHARACTERS
  )

  if (!title || !url || !type || !snippet) return null
  return { title, url, type, snippet }
}

function boundedSearchOutput(value: unknown, origin: string): SearchToolOutput {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    throw new Error('Search returned an invalid response')
  }

  const available = value.results
    .map((result) => searchResultSummary(result, origin))
    .filter((result): result is SearchResultSummary => result !== null)
    .slice(0, WEBMCP_SEARCH_MAX_RESULTS)
  const results: SearchResultSummary[] = []

  for (const result of available) {
    const candidate: SearchToolOutput = {
      results: [...results, result],
      // Reserve the longer boolean spelling while enforcing the output budget.
      hasMore: false,
    }
    if (JSON.stringify(candidate).length > WEBMCP_OUTPUT_MAX_CHARACTERS) break
    results.push(result)
  }

  return {
    results,
    hasMore: value.results.length > results.length,
  }
}

async function executeSearch(
  input: unknown,
  signal: AbortSignal,
  dependencies: SiteWebMcpDependencies
): Promise<SearchToolOutput> {
  const { query, scope } = parseSearchInput(input)
  const params = new URLSearchParams({ q: query, scope })

  const response = await dependencies.fetch(`/api/search?${params}`, {
    signal,
  })
  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      isRecord(body) && typeof body.error === 'string'
        ? truncate(body.error.trim(), 160)
        : 'Search failed. Try again.'
    throw new Error(detail || 'Search failed. Try again.')
  }

  return boundedSearchOutput(body, dependencies.origin)
}

export function createSiteWebMcpTools(
  dependencies: SiteWebMcpDependencies
): [
  WebMCP.ModelContextToolFromSchema<typeof searchInputSchema>,
  WebMCP.ModelContextToolFromSchema<typeof bellInputSchema>,
] {
  return [
    {
      name: 'search_philip_site',
      title: "Search Philip's site",
      description:
        "Search Philip Ilic Thomas's public writing, photos, and site pages. Use images for photos or places photographed and posts for writing. Returns a compact set of same-origin links and excerpts.",
      inputSchema: searchInputSchema,
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false,
        consequentialHint: false,
      },
      execute: (input, { signal }) =>
        executeSearch(input, signal, dependencies),
    },
    {
      name: 'start_bell_question',
      title: 'Ask Bell on this site',
      description:
        "Open the visible Bell AI sidebar and start a new conversation with a question about Philip's public site. This initiates a browser UI conversation; it does not wait for or return Bell's eventual answer.",
      inputSchema: bellInputSchema,
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false,
        consequentialHint: false,
      },
      execute: (input) => {
        const question = parseBellInput(input)
        dependencies.startBellQuestion(question)
        return {
          status: 'started',
          surface: 'Bell AI sidebar',
          message: 'Bell is answering in the visible site interface.',
        }
      },
    },
  ]
}

export function registerSiteWebMcpTools(
  modelContext: Pick<WebMCP.ModelContext, 'registerTool'>,
  dependencies: SiteWebMcpDependencies
): {
  abort(): void
  ready: Promise<unknown>
  signal: AbortSignal
} {
  const controller = new AbortController()
  const [searchTool, bellTool] = createSiteWebMcpTools(dependencies)
  const options = { signal: controller.signal }
  const ready = Promise.all([
    modelContext.registerTool(searchTool, options),
    modelContext.registerTool(bellTool, options),
  ])

  return {
    abort: () => controller.abort(),
    ready,
    signal: controller.signal,
  }
}
