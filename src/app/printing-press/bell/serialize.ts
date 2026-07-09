import type {
  BellConversationDetailWire,
  BellConversationSummaryWire,
  BellGenerationWire,
  BellMessageWire,
  BellToolWire,
} from '@/app/printing-press/bell/types'

type DbSummary = {
  id: string
  surface: 'web' | 'sms'
  status: 'active' | 'completed' | 'error'
  identity: 'signed_in' | 'phone' | 'anonymous'
  subscriberEmail: string | null
  subscriberName: string | null
  smsNumber: string | null
  networkIdentityLabel: string | null
  firstPagePath: string | null
  firstPageTitle: string | null
  messageCount: number
  lastMessageAt: Date | null
  latestGenerationStatus: string | null
  createdAt: Date
  updatedAt: Date
  expiresAt: Date | null
}

type DbMessage = {
  id: string
  role: string
  authorKind: string
  content: string | null
  sourceTextMessageId: number | null
  status: string
  createdAt: Date
  redactedAt: Date | null
}

type DbGeneration = {
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
  toolsUsed: unknown
  errorCode: string | null
  errorMessage: string | null
  createdAt: Date
  finishedAt: Date | null
}

type DbDetail = {
  conversation: DbSummary
  messages: DbMessage[]
  generations: DbGeneration[]
}

function participant(summary: DbSummary): {
  label: string
  detail: string | null
} {
  if (summary.identity === 'phone') {
    return {
      label: summary.smsNumber ?? 'Text visitor',
      detail: null,
    }
  }

  if (summary.identity === 'signed_in') {
    return {
      label:
        summary.subscriberName ??
        summary.subscriberEmail ??
        'Signed-in visitor',
      detail:
        summary.subscriberName && summary.subscriberEmail
          ? summary.subscriberEmail
          : null,
    }
  }

  return {
    label: summary.networkIdentityLabel?.slice(0, 64) ?? 'Anonymous visitor',
    detail: null,
  }
}

export function serializeBellSummary(
  summary: DbSummary
): BellConversationSummaryWire {
  const person = participant(summary)
  return {
    id: summary.id,
    surface: summary.surface,
    identity: summary.identity,
    status: summary.status,
    participantLabel: person.label,
    participantDetail: person.detail,
    phoneNumber: summary.smsNumber,
    firstPagePath: summary.firstPagePath,
    firstPageTitle: summary.firstPageTitle,
    messageCount: summary.messageCount,
    latestGenerationStatus: summary.latestGenerationStatus,
    firstActivityAt: summary.createdAt.toISOString(),
    lastActivityAt: (summary.lastMessageAt ?? summary.updatedAt).toISOString(),
    expiresAt: summary.expiresAt?.toISOString() ?? null,
  }
}

function safeToolStatus(value: unknown): BellToolWire['status'] {
  if (
    value === 'pending' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'error'
  ) {
    return value
  }
  return null
}

function toolFromUnknown(value: unknown): BellToolWire | null {
  if (typeof value === 'string') {
    const name = value.trim().slice(0, 80)
    return name ? { name, status: null } : null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const item = value as Record<string, unknown>
  const candidate =
    typeof item.name === 'string'
      ? item.name
      : typeof item.toolName === 'string'
        ? item.toolName
        : null
  const name = candidate?.trim().slice(0, 80)
  if (!name) return null
  return { name, status: safeToolStatus(item.status) }
}

/**
 * Tool payloads can contain queries and fetched content. Only names and a
 * small status enum cross the admin API boundary.
 */
function serializeTools(value: unknown): BellToolWire[] {
  if (!Array.isArray(value)) return []

  const tools: BellToolWire[] = []
  for (const item of value) {
    const tool = toolFromUnknown(item)
    if (!tool) continue
    if (
      tools.some(
        (existing) =>
          existing.name === tool.name && existing.status === tool.status
      )
    ) {
      continue
    }
    tools.push(tool)
  }
  return tools.slice(0, 20)
}

function serializeMessage(message: DbMessage): BellMessageWire {
  const authorKind =
    message.authorKind === 'visitor' ||
    message.authorKind === 'bell' ||
    message.authorKind === 'admin'
      ? message.authorKind
      : 'system'
  return {
    id: message.id,
    authorKind,
    role: message.role,
    content: message.content,
    status: message.status,
    sourceTextMessageId: message.sourceTextMessageId,
    createdAt: message.createdAt.toISOString(),
    redactedAt: message.redactedAt?.toISOString() ?? null,
  }
}

function serializeGeneration(generation: DbGeneration): BellGenerationWire {
  return {
    id: generation.id,
    userMessageId: generation.userMessageId,
    assistantMessageId: generation.assistantMessageId,
    status: generation.status,
    model: generation.model,
    provider: generation.provider,
    gatewayGenerationId: generation.gatewayGenerationId,
    callId: generation.callId,
    traceId: generation.traceId,
    workflowRunId: generation.workflowRunId,
    inputTokens: generation.inputTokens,
    outputTokens: generation.outputTokens,
    totalTokens: generation.totalTokens,
    cachedInputTokens: generation.cachedInputTokens,
    reasoningTokens: generation.reasoningTokens,
    costUsd: generation.costUsd,
    latencyMs: generation.latencyMs,
    finishReason: generation.finishReason,
    tools: serializeTools(generation.toolsUsed),
    errorCode: generation.errorCode,
    errorMessage: generation.errorMessage,
    createdAt: generation.createdAt.toISOString(),
    completedAt: generation.finishedAt?.toISOString() ?? null,
  }
}

export function serializeBellDetail(
  detail: DbDetail
): BellConversationDetailWire {
  return {
    conversation: serializeBellSummary(detail.conversation),
    messages: detail.messages.map(serializeMessage),
    generations: detail.generations.map(serializeGeneration),
  }
}
