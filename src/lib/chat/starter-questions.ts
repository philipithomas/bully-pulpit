export type BellSuggestionKind =
  | 'archive_overview'
  | 'archive_connections'
  | 'newsletter_overview'
  | 'page_summary'
  | 'photo_approach'
  | 'photo_japan'
  | 'photo_search'
  | 'recent_writing'
  | 'related_reading'

export interface BellStarterQuestion {
  kind: BellSuggestionKind
  text: string
}

const DEFAULT_QUESTIONS: readonly BellStarterQuestion[] = [
  {
    kind: 'archive_overview',
    text: 'What does Philip write about?',
  },
  {
    kind: 'recent_writing',
    text: 'What has Philip published recently?',
  },
  {
    kind: 'photo_search',
    text: 'Show me photos of coffee',
  },
]

const PHOTOGRAPHY_QUESTIONS: readonly BellStarterQuestion[] = [
  {
    kind: 'photo_search',
    text: 'Show me photos of coffee',
  },
  {
    kind: 'photo_japan',
    text: 'Find photographs from Japan',
  },
  {
    kind: 'photo_approach',
    text: 'How does Philip approach photography?',
  },
]

const PAGE_QUESTIONS: readonly BellStarterQuestion[] = [
  {
    kind: 'page_summary',
    text: 'Summarize this page',
  },
  {
    kind: 'archive_connections',
    text: "How does this connect to Philip's other writing?",
  },
  {
    kind: 'related_reading',
    text: 'What should I read next?',
  },
]

const NEWSLETTERS = new Map([
  ['/contraption', 'Contraption'],
  ['/workshop', 'Workshop'],
  ['/postcard', 'Postcard'],
  ['/tsundoku', 'Tsundoku'],
])

const PRIVATE_OR_UTILITY_PREFIXES = [
  '/account',
  '/admin',
  '/api',
  '/auth',
  '/printing-press',
  '/unsubscribe',
]

function normalizePathname(pathname: string): string {
  if (!pathname.startsWith('/')) return '/'
  if (pathname === '/') return pathname
  return pathname.replace(/\/+$/, '') || '/'
}

/**
 * Returns three fixed-vocabulary starters for the current public surface.
 * The displayed text can mention the page, but analytics records only `kind`.
 */
export function bellStarterQuestions(
  pathname: string
): readonly BellStarterQuestion[] {
  const normalized = normalizePathname(pathname)
  if (normalized === '/') return DEFAULT_QUESTIONS
  if (normalized === '/photography') return PHOTOGRAPHY_QUESTIONS

  const newsletter = NEWSLETTERS.get(normalized)
  if (newsletter) {
    return [
      {
        kind: 'newsletter_overview',
        text: `What is ${newsletter} about?`,
      },
      {
        kind: 'recent_writing',
        text: 'What did Philip publish here recently?',
      },
      {
        kind: 'related_reading',
        text: 'What should I read first?',
      },
    ]
  }

  if (
    PRIVATE_OR_UTILITY_PREFIXES.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
    )
  ) {
    return DEFAULT_QUESTIONS
  }

  return PAGE_QUESTIONS
}
