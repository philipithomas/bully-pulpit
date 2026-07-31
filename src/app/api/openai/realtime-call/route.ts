import OpenAI from 'openai'
import {
  claimPhoneWebhookEvent,
  findOrCreatePhoneWebhookEvent,
  markPhoneWebhookEventProcessed,
  releasePhoneWebhookEvent,
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
const GREETING_LEASE_MS = GREETING_DEADLINE_MS

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
      ...actionLogContext(request, incoming),
    })
    return response(503)
  }

  if (greetingEvent.event.processedAt) {
    return response(204)
  }
  if (
    Date.now() - greetingEvent.event.createdAt.getTime() >
    GREETING_DEADLINE_MS
  ) {
    console.info('[openai/realtime-call]', {
      event: 'bell_live.openai_greeting',
      outcome: 'expired',
      ...actionLogContext(request, incoming),
    })
    return response(204)
  }

  let lease: Date | null
  try {
    lease = await claimPhoneWebhookEvent(
      greetingEvent.event.id,
      GREETING_LEASE_MS
    )
  } catch {
    return response(503)
  }
  if (!lease) return response(503)

  try {
    const greeting = await startBellLiveGreeting(incoming.callId, {
      onResponseCreated: () =>
        markPhoneWebhookEventProcessed(greetingEvent.event.id, lease),
    })
    console.info('[openai/realtime-call]', {
      event: 'bell_live.openai_greeting',
      durationMs: greeting.durationMs,
      outcome: greeting.responseCheckpointed
        ? 'completed'
        : 'completed_uncheckpointed',
      ...actionLogContext(request, incoming),
    })
  } catch (error) {
    const responseRequested =
      error instanceof BellLiveGreetingError && error.responseRequested
    const retryable = !responseRequested && greetingEvent.inserted
    if (retryable) {
      await releasePhoneWebhookEvent(greetingEvent.event.id, lease).catch(
        () => undefined
      )
    } else {
      await markPhoneWebhookEventProcessed(greetingEvent.event.id, lease).catch(
        () => false
      )
    }
    console.error('[openai/realtime-call]', {
      event: 'bell_live.openai_greeting',
      durationMs:
        error instanceof BellLiveGreetingError ? error.durationMs : null,
      outcome: 'error',
      responseCreated:
        error instanceof BellLiveGreetingError ? error.responseCreated : false,
      responseRequested,
      retryable,
      providerErrorCode:
        error instanceof BellLiveGreetingError ? error.providerCode : null,
      providerErrorType:
        error instanceof BellLiveGreetingError ? error.providerType : null,
      responseStatus:
        error instanceof BellLiveGreetingError ? error.responseStatus : null,
      reason:
        error instanceof BellLiveGreetingError
          ? error.reason
          : 'internal_error',
      ...actionLogContext(request, incoming),
    })
    return response(retryable ? 502 : 204)
  }
  return response(204)
}
