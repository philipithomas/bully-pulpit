export type BellSurface = 'web' | 'sms'

export type BellIdentity = 'signed_in' | 'phone' | 'anonymous'

export type BellConversationStatus = 'active' | 'completed' | 'error'

export type BellConversationSummaryWire = {
  id: string
  surface: BellSurface
  identity: BellIdentity
  status: BellConversationStatus
  participantLabel: string
  participantDetail: string | null
  phoneNumber: string | null
  firstPagePath: string | null
  firstPageTitle: string | null
  messageCount: number
  latestGenerationStatus: string | null
  firstActivityAt: string
  lastActivityAt: string
  expiresAt: string | null
}

export type BellConversationListWire = {
  conversations: BellConversationSummaryWire[]
  nextCursor: string | null
}

export type BellMessageWire = {
  id: string
  authorKind: 'visitor' | 'bell' | 'admin' | 'system'
  role: string
  content: string | null
  status: string
  sourceTextMessageId: number | null
  createdAt: string
  redactedAt: string | null
}

export type BellToolWire = {
  name: string
  status: 'pending' | 'running' | 'completed' | 'error' | null
}

export type BellGenerationWire = {
  id: string
  userMessageId: string | null
  assistantMessageId: string | null
  status: string
  model: string | null
  provider: string | null
  gatewayGenerationId: string | null
  callId: string | null
  traceId: string | null
  workflowRunId: string | null
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  cachedInputTokens: number | null
  reasoningTokens: number | null
  costUsd: number | null
  latencyMs: number | null
  finishReason: string | null
  tools: BellToolWire[]
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

export type BellConversationDetailWire = {
  conversation: BellConversationSummaryWire
  messages: BellMessageWire[]
  generations: BellGenerationWire[]
}

export type BellListFilters = {
  surface: '' | BellSurface
  identity: '' | BellIdentity
  status: '' | BellConversationStatus
  dateFrom: string
  dateTo: string
  search: string
}

export const EMPTY_BELL_FILTERS: BellListFilters = {
  surface: '',
  identity: '',
  status: '',
  dateFrom: '',
  dateTo: '',
  search: '',
}
