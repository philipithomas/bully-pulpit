import { trace } from '@opentelemetry/api'
import {
  consumeStream,
  convertToModelMessages,
  type ModelMessage,
  streamText,
} from 'ai'
import { checkBotId } from 'botid/server'
import { NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { bucketDuration, bucketTurn } from '@/lib/analytics/events'
import { trackServerEvent } from '@/lib/analytics/server'
import {
  getVerifiedSession,
  SessionLookupUnavailableError,
} from '@/lib/auth/jwt'
import {
  bellGatewayCost,
  bellModel,
  bellStopWhen,
  bellTools,
  getBellProviderOptions,
  getBellReasoning,
  prepareBellStep,
} from '@/lib/chat/bell-generation'
import {
  canAppendToWebBellConversation,
  isClientConversationId,
  networkIdentityForRequest,
} from '@/lib/chat/bell-identity'
import { getPageContextContent } from '@/lib/chat/page-context'
import { sanitizeChatMessages } from '@/lib/chat/sanitize-messages'
import { sanitizePageTitle } from '@/lib/chat/sanitize-title'
import { getSystemPrompt } from '@/lib/chat/system-prompt'
import {
  createWebBellTurn,
  getOrCreateWebBellConversation,
} from '@/lib/db/queries/bell-conversations'
import {
  abortBellGeneration,
  completeBellGeneration,
  failBellGeneration,
  markBellGenerationRunning,
  setBellGenerationAssistantMessageId,
} from '@/lib/db/queries/bell-generations'
import {
  createBellMessage,
  textFromBellParts,
} from '@/lib/db/queries/bell-messages'
import { readJsonBody } from '@/lib/http/json-body'
import { checkRateLimitStatus } from '@/lib/rate-limit'

export const CHAT_BODY_MAX_BYTES = 256 * 1024

const chatBodySchema = z.strictObject({
  id: z.string().max(200),
  requestId: z.string().max(200),
  // The byte cap bounds raw parsing. The sanitizer then examines only the
  // newest bounded window, preserving long-lived browser conversations.
  messages: z.array(z.unknown()).min(1),
  trigger: z.enum(['submit-message', 'regenerate-message']).optional(),
  messageId: z.string().max(200).optional(),
  // Context is optional UX metadata, not request authority. Keep its
  // long-standing fail-open behavior and sanitize recognized values below.
  pageContext: z.unknown().optional(),
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function POST(request: Request) {
  // Reject malformed, mistyped, or oversized input before making any
  // Firewall, BotID, database, or model/provider call.
  const parsedBody = await readJsonBody(
    request,
    chatBodySchema,
    CHAT_BODY_MAX_BYTES
  )
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.error },
      { status: parsedBody.status }
    )
  }
  const body = parsedBody.data

  if (!isClientConversationId(body.id)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  if (!isClientConversationId(body.requestId)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const rawPageContext = isRecord(body.pageContext)
    ? body.pageContext
    : undefined
  const rawPath = rawPageContext?.path
  const path =
    typeof rawPath === 'string' &&
    rawPath.length <= 200 &&
    /^\/[a-zA-Z0-9/_-]*$/.test(rawPath)
      ? rawPath
      : undefined
  const title = sanitizePageTitle(rawPageContext?.title)
  const sanitizedMessages = sanitizeChatMessages(body.messages)
  if (sanitizedMessages.length === 0) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  let messages: ModelMessage[]
  try {
    messages = await convertToModelMessages(sanitizedMessages)
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const latestUserMessage = sanitizedMessages.findLast(
    (message) => message.role === 'user'
  )
  if (!latestUserMessage) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const ip =
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'

  // These checks read only request or cookie headers and can run together once
  // the cheap local trust-boundary validation has succeeded.
  let sessionLookupUnavailable = false
  const verifiedSessionPromise = getVerifiedSession().catch((error) => {
    if (!(error instanceof SessionLookupUnavailableError)) throw error
    sessionLookupUnavailable = true
    console.error('[api/chat] session lookup failed:', error)
    return null
  })
  const [rateLimit, { isBot }, verifiedSession] = await Promise.all([
    checkRateLimitStatus('chat', `ip:${ip}`, request),
    checkBotId(),
    verifiedSessionPromise,
  ])

  if (sessionLookupUnavailable) {
    return NextResponse.json(
      { error: 'Bell is temporarily unavailable. Please try again later.' },
      {
        status: 503,
        headers: { 'Cache-Control': 'private, no-store' },
      }
    )
  }

  if (rateLimit === 'limited') {
    return NextResponse.json(
      { error: 'Too many messages. Please try again later.' },
      { status: 429 }
    )
  }
  if (rateLimit === 'unavailable') {
    return NextResponse.json(
      { error: 'Bell is temporarily unavailable. Please try again later.' },
      { status: 503 }
    )
  }

  if (isBot) {
    return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
  }
  const subscriber = verifiedSession?.subscriber ?? null
  const networkIdentity = subscriber ? null : networkIdentityForRequest(request)
  const conversation = await getOrCreateWebBellConversation({
    clientConversationId: body.id,
    subscriberId: subscriber?.id,
    networkIdentityHash: networkIdentity?.hash,
    networkIdentityPeriod: networkIdentity?.period,
    pagePath: path,
    pageTitle: title,
  })
  if (
    !canAppendToWebBellConversation(
      conversation.subscriberId,
      subscriber?.id ?? null
    )
  ) {
    return NextResponse.json(
      {
        error:
          'This Bell conversation belongs to another session. Start a new conversation.',
      },
      { status: 409 }
    )
  }
  const activeSpan = trace.getActiveSpan()?.spanContext()
  const turn = await createWebBellTurn({
    conversation,
    requestId: body.requestId,
    clientMessageId: latestUserMessage.id,
    content: textFromBellParts(latestUserMessage.parts),
    parts: latestUserMessage.parts,
    traceId: activeSpan?.isRemote ? null : activeSpan?.traceId,
  })
  if (!turn.generationInserted) {
    return NextResponse.json(
      { error: 'This message is already being answered.' },
      { status: 409 }
    )
  }
  await markBellGenerationRunning(turn.generation.id)
  const startedAt = Date.now()
  let generationOutcome: 'running' | 'completed' | 'aborted' | 'error' =
    'running'
  const turnNumber = sanitizedMessages.filter(
    (message) => message.role === 'user'
  ).length

  // When the visitor is on a known post or page, inject its content for answer
  // quality. Its separately resolved source metadata is attached only after a
  // successful stream, so the client has deterministic provenance even when
  // the model does not call the requested fetch tool.
  const pageContent = getPageContextContent(path)
  const system = getSystemPrompt({
    pageContext: { path, title },
    pageContent,
    // Only the server-verified display name reaches the prompt. Email is not a
    // conversational attribute, and the client-supplied userName is ignored.
    userName: sanitizePageTitle(subscriber?.name),
  })

  const result = streamText({
    // Shared with SMS so every Bell surface uses GPT-5.6 Sol.
    model: bellModel,
    reasoning: getBellReasoning('web', turnNumber),
    providerOptions: getBellProviderOptions({
      surface: 'web',
      pseudonymousUser: subscriber
        ? `subscriber:${subscriber.uuid}`
        : networkIdentity
          ? `network:${networkIdentity.hash}`
          : null,
    }),
    maxOutputTokens: 2048,
    // Stop upstream generation when the visitor hits Stop or disconnects.
    abortSignal: request.signal,
    runtimeContext: { path: path ?? 'unknown' },
    telemetry: {
      isEnabled: true,
      functionId: 'bell-chat',
      // Neon is the canonical, retention-controlled transcript. Vercel keeps
      // aggregate traces without receiving another copy of message content.
      recordInputs: false,
      recordOutputs: false,
      includeRuntimeContext: { path: true },
    },
    system,
    messages,
    tools: bellTools,
    stopWhen: bellStopWhen,
    prepareStep: prepareBellStep,
    onEnd: async (event) => {
      // AI SDK reports provider failures through onError. Do not let the
      // terminal onEnd callback overwrite that authoritative error outcome.
      if (event.finishReason === 'error') {
        generationOutcome = 'error'
        return
      }
      const gateway = await bellGatewayCost(
        event.steps.map((step) => step.providerMetadata)
      )
      const toolsUsed = Array.from(
        new Set(
          event.steps.flatMap((step) =>
            step.toolCalls.map((call) => call.toolName)
          )
        )
      )
      await completeBellGeneration(turn.generation.id, {
        model: event.model.modelId,
        provider: event.model.provider,
        callId: event.callId,
        gatewayGenerationId: gateway.gatewayGenerationId,
        inputTokens: event.usage.inputTokens ?? null,
        outputTokens: event.usage.outputTokens ?? null,
        totalTokens: event.usage.totalTokens ?? null,
        cachedInputTokens:
          event.usage.inputTokenDetails.cacheReadTokens ?? null,
        reasoningTokens: event.usage.outputTokenDetails.reasoningTokens ?? null,
        costUsd: gateway.costUsd,
        latencyMs: Date.now() - startedAt,
        finishReason: event.finishReason,
        toolsUsed,
      })
      generationOutcome = 'completed'
      await trackServerEvent(request, 'Bell reply finished', {
        surface: 'web',
        outcome: 'success',
        duration: bucketDuration(Date.now() - startedAt),
        finish_reason: bellAnalyticsFinishReason(event.finishReason),
        tool_used: toolsUsed.length > 0,
        turn: bucketTurn(turnNumber),
      })
    },
    onAbort: async () => {
      generationOutcome = 'aborted'
      await abortBellGeneration(turn.generation.id, Date.now() - startedAt)
      await trackServerEvent(request, 'Bell reply finished', {
        surface: 'web',
        outcome: 'stopped',
        duration: bucketDuration(Date.now() - startedAt),
        finish_reason: 'stop',
        tool_used: false,
        turn: bucketTurn(turnNumber),
      })
    },
    onError: async ({ error }) => {
      generationOutcome = 'error'
      await failBellGeneration(
        turn.generation.id,
        error,
        Date.now() - startedAt
      )
      await trackServerEvent(request, 'Bell reply finished', {
        surface: 'web',
        outcome: 'error',
        duration: bucketDuration(Date.now() - startedAt),
        finish_reason: 'error',
        tool_used: false,
        turn: bucketTurn(turnNumber),
      })
    },
  })

  return result.toUIMessageStreamResponse({
    originalMessages: sanitizedMessages,
    consumeSseStream: consumeStream,
    // Follow-up turns use high reasoning, but chain-of-thought and provider
    // reasoning metadata must never reach the browser or saved UI transcript.
    sendReasoning: false,
    messageMetadata: ({ part }) => {
      if (
        !pageContent ||
        part.type !== 'finish' ||
        part.finishReason === 'error' ||
        request.signal.aborted ||
        generationOutcome === 'aborted' ||
        generationOutcome === 'error'
      ) {
        return undefined
      }
      return { currentPageSource: pageContent.source }
    },
    onEnd: async ({ responseMessage, isAborted }) => {
      const messageStatus =
        isAborted || generationOutcome === 'aborted'
          ? 'aborted'
          : generationOutcome === 'error'
            ? 'error'
            : 'completed'
      const assistant = await createBellMessage({
        conversationId: conversation.id,
        role: 'assistant',
        authorKind: 'bell',
        content: textFromBellParts(responseMessage.parts),
        parts: responseMessage.parts,
        // Stable across a retried HTTP request even if the AI SDK assigns a
        // new response message ID while rebuilding the stream.
        clientMessageId: `generation:${turn.generation.id}`,
        replyToMessageId: turn.userMessage.id,
        status: messageStatus,
        expiresAt: conversation.expiresAt,
      })
      await setBellGenerationAssistantMessageId(
        turn.generation.id,
        assistant.message.id
      )
      if (isAborted) {
        await abortBellGeneration(turn.generation.id, Date.now() - startedAt)
      }
    },
    // The default onError forwards raw error text (provider internals) to
    // the visitor. Log it server-side and send a friendly message instead.
    onError: (error) => {
      console.error('[chat] stream error:', error)
      return 'Something went wrong. Please try again.'
    },
  })
}

function bellAnalyticsFinishReason(
  reason: string
):
  | 'stop'
  | 'length'
  | 'content_filter'
  | 'tool_calls'
  | 'error'
  | 'other'
  | 'unknown' {
  if (reason === 'stop' || reason === 'length' || reason === 'error') {
    return reason
  }
  if (reason === 'content-filter') return 'content_filter'
  if (reason === 'tool-calls') return 'tool_calls'
  if (reason === 'unknown') return 'unknown'
  return 'other'
}
