export const SELECTED_PASSAGE_MIN_CHARS = 20
export const SELECTED_PASSAGE_MAX_CHARS = 1_200

export const SELECTED_PASSAGE_ACTIONS = [
  {
    id: 'explain',
    label: 'Explain this',
    prompt: 'Explain this selected passage.',
  },
  {
    id: 'connect',
    label: 'Connect this to other writing',
    prompt: "Connect this selected passage to Philip's other writing.",
  },
  {
    id: 'context',
    label: 'Give me the surrounding context',
    prompt: 'Give me the surrounding context for this selected passage.',
  },
] as const

export type SelectedPassageAction =
  (typeof SELECTED_PASSAGE_ACTIONS)[number]['id']

export interface SelectedPassageRequest {
  action: SelectedPassageAction
  text: string
  path: string
  headingId?: string
}

const PASSAGE_DISABLED_PAGE_SLUGS = new Set([
  'contact',
  'policies',
  'privacy',
  'stargazing',
  'terms',
  'text-messaging',
])

export function isSelectedPassageAction(
  value: unknown
): value is SelectedPassageAction {
  return SELECTED_PASSAGE_ACTIONS.some((action) => action.id === value)
}

export function collapsePlainTextWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function normalizeSelectedPassage(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = collapsePlainTextWhitespace(value)
  if (
    normalized.length < SELECTED_PASSAGE_MIN_CHARS ||
    normalized.length > SELECTED_PASSAGE_MAX_CHARS
  ) {
    return null
  }
  return normalized
}

export function selectedPassageUserMessage(
  action: SelectedPassageAction,
  text: string
): string {
  const prompt = SELECTED_PASSAGE_ACTIONS.find(
    (candidate) => candidate.id === action
  )?.prompt
  return `${prompt ?? SELECTED_PASSAGE_ACTIONS[0].prompt}\n\n> ${text}`
}

export function selectedPassageRequestOptions(
  request: SelectedPassageRequest | null
): {
  body?: {
    selectedPassage: SelectedPassageRequest
    pageContext: { path: string }
  }
} {
  return request
    ? {
        body: {
          selectedPassage: request,
          // Request-specific body fields override the transport defaults.
          // Keep retries bound to the page where the passage was selected,
          // even if the visitor navigated before choosing Try again.
          pageContext: { path: request.path },
        },
      }
    : {}
}

export function isPassageSelectableContent(
  slug: string,
  type: 'post' | 'page'
): boolean {
  return type === 'post' || !PASSAGE_DISABLED_PAGE_SLUGS.has(slug)
}
