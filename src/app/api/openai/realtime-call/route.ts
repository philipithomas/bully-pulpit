import { after } from 'next/server'
import OpenAI from 'openai'
import {
  claimPhoneWebhookEventAttempt,
  findOrCreatePhoneWebhookEvent,
  markPhoneWebhookEventProcessed,
  markPhoneWebhookEventSideEffectObserved,
} from '@/lib/db/queries/phone-webhook-events'
import {
  acceptBellLiveCall,
  BellLiveGreetingError,
  isOpenAiRealtimeCallId,
  OpenAiCallActionError,
  type OpenAiCallActionResult,
  type OpenAiSipHeader,
  phoneBellLiveConfigured,
  rejectBellLiveCall,
  startBellLiveGreeting,
  verifiedBellLiveSipCallSid,
} from '@/lib/phone/bell-live'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 20

const MAX_WEBHOOK_BYTES = 64 * 1024
const GREETING_DEADLINE_MS = 15_000
const GREETING_LEASE_MS = 6_000
// Once OpenAI accepts the SIP call, the opener is best-effort. Never reclaim
// it: a late replay is worse than letting the caller begin the conversation.
const GREETING_MAX_ATTEMPTS = 1
const GREETING_CHECKPOINT_ATTEMPTS = 3
const GREETING_SOCKET_ATTEMPTS = 2
const GREETING_SOCKET_RETRY_DELAY_MS = 150

interface IncomingCallEvent {
  callId: string
  eventId: string | null
  eventType: 'live.call.incoming' | 'realtime.call.incoming'
  sipHeaders: OpenAiSipHeader[]
}

function response(status: number): Response {
  return new Response(null, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

async function checkpointBellLiveGreeting(
  eventId: number,
  processingAt: Date,
  processedStepId: string
): Promise<boolean> {
  for (let attempt = 0; attempt < GREETING_CHECKPOINT_ATTEMPTS; attempt += 1) {
    try {
      if (
        await markPhoneWebhookEventProcessed(
          eventId,
          processingAt,
          processedStepId
        )
      ) {
        return true
      }
    } catch {
      // Retry with the same step ID so a committed write whose acknowledgement
      // was lost is recognized as success rather than replaying SIP audio.
    }
  }
  return false
}

async function terminalizeObservedBellLiveGreeting(
  eventId: number,
  processingAt: Date,
  processedStepId: string
): Promise<boolean> {
  if (
    await checkpointBellLiveGreeting(eventId, processingAt, processedStepId)
  ) {
    return true
  }

  // Once OpenAI confirms that this response's audio reached the SIP caller,
  // the irreversible side effect must remain terminal even if its short lease
  // expired while the provider was speaking or a database acknowledgement was
  // lost. This unfenced fallback is deliberately never used before audio.
  for (let attempt = 0; attempt < GREETING_CHECKPOINT_ATTEMPTS; attempt += 1) {
    try {
      if (
        await markPhoneWebhookEventSideEffectObserved(eventId, processedStepId)
      ) {
        return true
      }
    } catch {
      // Retry with the same stable step ID so the fallback is idempotent.
    }
  }
  return false
}

function canRetryBellLiveGreeting(
  error: unknown
): error is BellLiveGreetingError {
  return (
    error instanceof BellLiveGreetingError &&
    !error.audioStarted &&
    !error.responseRequested &&
    (error.reason === 'closed' ||
      error.reason === 'socket_error' ||
      error.reason === 'timeout')
  )
}

async function startBellLiveGreetingWithRetry(input: {
  callId: string
  logContext: Record<string, unknown>
  onAudioStarted: () => Promise<boolean>
}): Promise<Awaited<ReturnType<typeof startBellLiveGreeting>>> {
  for (
    let socketAttempt = 1;
    socketAttempt <= GREETING_SOCKET_ATTEMPTS;
    socketAttempt += 1
  ) {
    try {
      return await startBellLiveGreeting(input.callId, {
        onAudioStarted: input.onAudioStarted,
      })
    } catch (error) {
      if (
        socketAttempt >= GREETING_SOCKET_ATTEMPTS ||
        !canRetryBellLiveGreeting(error)
      ) {
        throw error
      }
      console.info('[openai/realtime-call]', {
        event: 'bell_live.openai_greeting',
        outcome: 'retrying_socket',
        reason: error.reason,
        socketAttempt,
        ...input.logContext,
      })
      await new Promise((resolve) =>
        setTimeout(resolve, GREETING_SOCKET_RETRY_DELAY_MS)
      )
    }
  }

  throw new Error('Bell Live greeting retry loop exhausted')
}

function isSipHeader(value: unknown): value is OpenAiSipHeader {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'name' in value &&
      typeof value.name === 'string' &&
      'value' in value &&
      typeof value.value === 'string'
  )
}

function opaqueId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(value)
    ? value
    : null
}

function incomingCallEvent(value: unknown): IncomingCallEvent | null {
  if (!value || typeof value !== 'object' || !('type' in value)) return null
  if (
    value.type !== 'realtime.call.incoming' &&
    value.type !== 'live.call.incoming'
  ) {
    return null
  }
  if (!('data' in value) || !value.data || typeof value.data !== 'object') {
    return null
  }
  const data = value.data as {
    call_id?: unknown
    session_id?: unknown
    sip_headers?: unknown
  }
  // OpenAI may emit both event types for one pending SIP session. The Live
  // session_id and Realtime call_id identify the same rtc_... invitation.
  const callId =
    value.type === 'realtime.call.incoming' ? data.call_id : data.session_id
  if (
    typeof callId !== 'string' ||
    !isOpenAiRealtimeCallId(callId) ||
    !Array.isArray(data.sip_headers) ||
    !data.sip_headers.every(isSipHeader)
  ) {
    return null
  }
  return {
    callId,
    eventId: 'id' in value ? opaqueId(value.id) : null,
    eventType: value.type,
    sipHeaders: data.sip_headers,
  }
}

function actionLogContext(
  request: Request,
  incoming: IncomingCallEvent
): Record<string, unknown> {
  return {
    callId: incoming.callId,
    eventId: incoming.eventId,
    eventType: incoming.eventType,
    webhookId: opaqueId(request.headers.get('webhook-id')),
  }
}

function logActionFailure(
  request: Request,
  incoming: IncomingCallEvent,
  action: 'accept' | 'reject',
  error: unknown
): void {
  const details =
    error instanceof OpenAiCallActionError
      ? {
          durationMs: error.durationMs,
          httpStatus: error.status,
          openAiRequestId: error.requestId,
          providerErrorBodyTruncated: error.provider.truncated,
          providerErrorCode: error.provider.code,
          providerErrorParam: error.provider.param,
          providerErrorType: error.provider.type,
          reason: error.reason,
        }
      : {
          durationMs: null,
          httpStatus: null,
          openAiRequestId: null,
          providerErrorBodyTruncated: false,
          providerErrorCode: null,
          providerErrorParam: null,
          providerErrorType: null,
          reason: 'internal_error',
        }

  console.error('[openai/realtime-call]', {
    event: 'bell_live.openai_call_action',
    action,
    outcome: 'error',
    ...actionLogContext(request, incoming),
    ...details,
  })
}

async function runBellLiveGreeting(input: {
  callId: string
  logContext: Record<string, unknown>
  twilioCallSid: string
}): Promise<void> {
  const { callId, logContext, twilioCallSid } = input
  let greetingEvent: Awaited<ReturnType<typeof findOrCreatePhoneWebhookEvent>>
  try {
    greetingEvent = await findOrCreatePhoneWebhookEvent({
      eventKey: `bell-live-greeting:${twilioCallSid}`,
      eventType: 'bell-live-greeting',
    })
  } catch {
    console.error('[openai/realtime-call]', {
      event: 'bell_live.openai_greeting',
      outcome: 'claim_error',
      ...logContext,
    })
    return
  }

  if (greetingEvent.event.processedAt) return
  if (
    Date.now() - greetingEvent.event.createdAt.getTime() >
    GREETING_DEADLINE_MS
  ) {
    console.info('[openai/realtime-call]', {
      event: 'bell_live.openai_greeting',
      outcome: 'expired',
      ...logContext,
    })
    return
  }

  let greetingClaim: Awaited<ReturnType<typeof claimPhoneWebhookEventAttempt>>
  try {
    greetingClaim = await claimPhoneWebhookEventAttempt(
      greetingEvent.event.id,
      {
        leaseMs: GREETING_LEASE_MS,
        maxAttempts: GREETING_MAX_ATTEMPTS,
      }
    )
  } catch {
    console.error('[openai/realtime-call]', {
      event: 'bell_live.openai_greeting',
      outcome: 'claim_error',
      ...logContext,
    })
    return
  }
  if (greetingClaim.outcome !== 'claimed') return

  const { attemptNumber, processingAt: lease } = greetingClaim
  const processedStepId = `bell-live-greeting:${twilioCallSid}`
  const checkpointGreeting = () =>
    terminalizeObservedBellLiveGreeting(
      greetingEvent.event.id,
      lease,
      processedStepId
    )

  try {
    const greeting = await startBellLiveGreetingWithRetry({
      callId,
      logContext,
      onAudioStarted: checkpointGreeting,
    })
    if (!greeting.responseCheckpointed) {
      console.error('[openai/realtime-call]', {
        event: 'bell_live.openai_greeting',
        durationMs: greeting.durationMs,
        attemptNumber,
        audioStarted: greeting.audioStarted,
        outcome: 'checkpoint_error',
        ...logContext,
      })
      return
    }
    console.info('[openai/realtime-call]', {
      event: 'bell_live.openai_greeting',
      durationMs: greeting.durationMs,
      attemptNumber,
      audioStarted: greeting.audioStarted,
      outcome: 'completed',
      ...logContext,
    })
  } catch (error) {
    const audioStarted =
      error instanceof BellLiveGreetingError && error.audioStarted
    const terminalCheckpointed = audioStarted
      ? await checkpointGreeting()
      : await checkpointBellLiveGreeting(
          greetingEvent.event.id,
          lease,
          processedStepId
        )
    console.error('[openai/realtime-call]', {
      event: 'bell_live.openai_greeting',
      attemptNumber,
      audioStarted,
      durationMs:
        error instanceof BellLiveGreetingError ? error.durationMs : null,
      outcome: 'error',
      responseCreated:
        error instanceof BellLiveGreetingError ? error.responseCreated : false,
      responseRequested:
        error instanceof BellLiveGreetingError
          ? error.responseRequested
          : false,
      retryable: false,
      providerErrorCode:
        error instanceof BellLiveGreetingError ? error.providerCode : null,
      providerErrorType:
        error instanceof BellLiveGreetingError ? error.providerType : null,
      responseStatus:
        error instanceof BellLiveGreetingError ? error.responseStatus : null,
      socketCloseCode:
        error instanceof BellLiveGreetingError ? error.socketCloseCode : null,
      socketHttpStatus:
        error instanceof BellLiveGreetingError ? error.socketHttpStatus : null,
      reason:
        error instanceof BellLiveGreetingError
          ? error.reason
          : 'internal_error',
      terminalCheckpointed,
      ...logContext,
    })
  }
}

/**
 * Signed OpenAI project webhook for incoming Live or Realtime SIP calls. OpenAI's
 * signature authenticates the provider; the custom SIP HMAC additionally
 * proves that this call leg came through our signed Twilio phone menu.
 */
export async function POST(request: Request): Promise<Response> {
  if (!phoneBellLiveConfigured()) return response(503)

  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    return response(413)
  }
  const body = await request.text()
  if (Buffer.byteLength(body, 'utf8') > MAX_WEBHOOK_BYTES) {
    return response(413)
  }

  let event: unknown
  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      webhookSecret: process.env.OPENAI_WEBHOOK_SECRET,
    })
    event = await client.webhooks.unwrap(body, request.headers)
  } catch {
    return response(401)
  }

  if (event && typeof event === 'object' && 'type' in event) {
    if (
      event.type !== 'realtime.call.incoming' &&
      event.type !== 'live.call.incoming'
    ) {
      return response(204)
    }
  }

  const incoming = incomingCallEvent(event)
  if (!incoming) {
    return response(400)
  }
  const twilioCallSid = verifiedBellLiveSipCallSid(incoming.sipHeaders)
  if (!twilioCallSid) {
    try {
      const result = await rejectBellLiveCall(incoming.callId)
      console.info('[openai/realtime-call]', {
        event: 'bell_live.openai_call_action',
        action: result.action,
        durationMs: result.durationMs,
        httpStatus: result.status,
        openAiRequestId: result.requestId,
        outcome: result.outcome,
        ...actionLogContext(request, incoming),
      })
    } catch (error) {
      logActionFailure(request, incoming, 'reject', error)
      return response(502)
    }
    return response(204)
  }

  let result: OpenAiCallActionResult
  try {
    result = await acceptBellLiveCall(incoming.callId)
    console.info('[openai/realtime-call]', {
      event: 'bell_live.openai_call_action',
      action: result.action,
      durationMs: result.durationMs,
      httpStatus: result.status,
      openAiRequestId: result.requestId,
      outcome: result.outcome,
      ...actionLogContext(request, incoming),
    })
  } catch (error) {
    logActionFailure(request, incoming, 'accept', error)
    return response(502)
  }

  const logContext = actionLogContext(request, incoming)
  try {
    after(async () => {
      try {
        await runBellLiveGreeting({
          callId: incoming.callId,
          logContext,
          twilioCallSid,
        })
      } catch {
        console.error('[openai/realtime-call]', {
          event: 'bell_live.openai_greeting',
          outcome: 'background_error',
          ...logContext,
        })
      }
    })
  } catch {
    console.error('[openai/realtime-call]', {
      event: 'bell_live.openai_greeting',
      outcome: 'schedule_error',
      ...logContext,
    })
  }

  // A successful accept only means OpenAI has begun establishing the SIP
  // session. Acknowledge the webhook immediately; waiting for the optional
  // sideband opener here can prevent the session from becoming attachable.
  return response(204)
}
