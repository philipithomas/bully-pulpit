import OpenAI from 'openai'
import {
  acceptBellLiveCall,
  isOpenAiRealtimeCallId,
  type OpenAiSipHeader,
  phoneBellLiveConfigured,
  rejectBellLiveCall,
  verifyBellLiveSipInvitation,
} from '@/lib/phone/bell-live'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

const MAX_WEBHOOK_BYTES = 64 * 1024

interface RealtimeCallIncomingEvent {
  type: 'realtime.call.incoming'
  data: {
    call_id: string
    sip_headers: OpenAiSipHeader[]
  }
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

function realtimeCallIncomingEvent(
  value: unknown
): RealtimeCallIncomingEvent | null {
  if (!value || typeof value !== 'object' || !('type' in value)) return null
  if (value.type !== 'realtime.call.incoming') return null
  if (!('data' in value) || !value.data || typeof value.data !== 'object') {
    return null
  }
  const data = value.data as { call_id?: unknown; sip_headers?: unknown }
  if (
    typeof data.call_id !== 'string' ||
    !isOpenAiRealtimeCallId(data.call_id) ||
    !Array.isArray(data.sip_headers) ||
    !data.sip_headers.every(isSipHeader)
  ) {
    return null
  }
  return {
    type: 'realtime.call.incoming',
    data: { call_id: data.call_id, sip_headers: data.sip_headers },
  }
}

/**
 * Signed OpenAI project webhook for incoming Realtime SIP calls. OpenAI's
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

  if (
    event &&
    typeof event === 'object' &&
    'type' in event &&
    event.type !== 'realtime.call.incoming'
  ) {
    return response(204)
  }

  const incoming = realtimeCallIncomingEvent(event)
  if (!incoming) return response(400)

  const { call_id: callId, sip_headers: sipHeaders } = incoming.data
  if (!verifyBellLiveSipInvitation(sipHeaders)) {
    try {
      await rejectBellLiveCall(callId)
    } catch (error) {
      console.error(
        '[openai/realtime-call] failed to reject unauthorized SIP call:',
        error instanceof Error ? error.message : 'UnknownError'
      )
      return response(502)
    }
    return response(204)
  }

  try {
    await acceptBellLiveCall(callId)
  } catch (error) {
    console.error(
      '[openai/realtime-call] failed to accept authorized SIP call:',
      error instanceof Error ? error.message : 'UnknownError'
    )
    return response(502)
  }
  return response(204)
}
