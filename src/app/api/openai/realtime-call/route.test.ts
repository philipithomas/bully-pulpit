import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/openai/realtime-call/route'
import { bellLiveSipUri } from '@/lib/phone/bell-live'
import { FakeOpenAiRealtimeWebSocket } from '@/test/fake-openai-realtime-websocket'

const webhookEvents = vi.hoisted(() => ({
  claim: vi.fn(),
  findOrCreate: vi.fn(),
  markProcessed: vi.fn(),
  release: vi.fn(),
}))

vi.mock('@/lib/db/queries/phone-webhook-events', () => ({
  claimPhoneWebhookEvent: webhookEvents.claim,
  findOrCreatePhoneWebhookEvent: webhookEvents.findOrCreate,
  markPhoneWebhookEventProcessed: webhookEvents.markProcessed,
  releasePhoneWebhookEvent: webhookEvents.release,
}))

const WEBHOOK_SECRET_BYTES = Buffer.from('test-openai-webhook-secret')
const WEBHOOK_SECRET = `whsec_${WEBHOOK_SECRET_BYTES.toString('base64')}`
const CALL_SID = 'CA1234567890abcdef1234567890abcdef'

function sipHeaders() {
  const uri = bellLiveSipUri(CALL_SID)
  if (!uri) throw new Error('Bell Live SIP URI was not configured')
  return Array.from(
    new URLSearchParams(uri.slice(uri.indexOf('?') + 1)),
    ([name, value]) => ({ name, value })
  )
}

function signedRequest(value: unknown, valid = true): Request {
  const body = JSON.stringify(value)
  const webhookId = 'wh_test_realtime_call'
  const timestamp = String(Math.floor(Date.now() / 1_000))
  const signature = createHmac('sha256', WEBHOOK_SECRET_BYTES)
    .update(`${webhookId}.${timestamp}.${body}`)
    .digest('base64')
  return new Request('https://www.philipithomas.com/api/openai/realtime-call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'webhook-id': webhookId,
      'webhook-timestamp': timestamp,
      'webhook-signature': `v1,${valid ? signature : 'invalid'}`,
    },
    body,
  })
}

function incomingEvent(headers = sipHeaders()) {
  return {
    object: 'event',
    id: 'evt_test_realtime_call',
    type: 'realtime.call.incoming',
    created_at: Math.floor(Date.now() / 1_000),
    data: {
      call_id: 'rtc_call_123',
      sip_headers: headers,
    },
  }
}

function liveIncomingEvent(headers = sipHeaders()) {
  return {
    object: 'event',
    id: 'evt_test_live_call',
    type: 'live.call.incoming',
    created_at: Math.floor(Date.now() / 1_000),
    data: {
      session_id: 'rtc_call_live_123',
      sip_headers: headers,
    },
  }
}

beforeEach(() => {
  FakeOpenAiRealtimeWebSocket.finalStatus = 'completed'
  FakeOpenAiRealtimeWebSocket.sentEvents = []
  FakeOpenAiRealtimeWebSocket.throwOnSend = false
  const createdAt = new Date()
  webhookEvents.findOrCreate.mockReset()
  webhookEvents.findOrCreate.mockResolvedValue({
    event: {
      id: 1,
      eventKey: `bell-live-greeting:${CALL_SID}`,
      eventType: 'bell-live-greeting',
      processingAt: null,
      processedAt: null,
      processedStepId: null,
      createdAt,
    },
    inserted: true,
  })
  webhookEvents.claim.mockReset()
  webhookEvents.claim.mockResolvedValue(new Date())
  webhookEvents.markProcessed.mockReset()
  webhookEvents.markProcessed.mockResolvedValue(true)
  webhookEvents.release.mockReset()
  webhookEvents.release.mockResolvedValue(undefined)
  vi.stubGlobal('WebSocket', FakeOpenAiRealtimeWebSocket)
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.OPENAI_API_KEY = 'test-openai-key'
  process.env.OPENAI_PROJECT_ID = 'proj_test123'
  process.env.OPENAI_WEBHOOK_SECRET = WEBHOOK_SECRET
  process.env.TWILIO_SECRET = 'test-twilio-secret'
})

afterEach(() => {
  delete process.env.OPENAI_API_KEY
  delete process.env.OPENAI_PROJECT_ID
  delete process.env.OPENAI_WEBHOOK_SECRET
  delete process.env.TWILIO_SECRET
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('POST /api/openai/realtime-call', () => {
  it('verifies both signatures and accepts an authorized SIP call', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(null, {
          status: 200,
          headers: { 'x-request-id': 'req_accept_123' },
        })
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(signedRequest(incomingEvent()))

    expect(response.status).toBe(204)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.openai.com/v1/realtime/calls/rtc_call_123/accept'
    )
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: 'Bearer test-openai-key',
      'Content-Type': 'application/json',
      'OpenAI-Project': 'proj_test123',
    })
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      model: string
      audio: { input: Record<string, unknown> }
    }
    expect(body.model).toBe('gpt-realtime-2.1')
    expect(body.audio.input).not.toHaveProperty('transcription')
    expect(FakeOpenAiRealtimeWebSocket.sentEvents[0]).toMatchObject({
      type: 'response.create',
    })
    expect(console.info).toHaveBeenCalledWith(
      '[openai/realtime-call]',
      expect.objectContaining({
        event: 'bell_live.openai_call_action',
        eventType: 'realtime.call.incoming',
        httpStatus: 200,
        openAiRequestId: 'req_accept_123',
        outcome: 'handled',
      })
    )
  })

  it('accepts the equivalent Live incoming-call webhook into Realtime', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(signedRequest(liveIncomingEvent()))

    expect(response.status).toBe(204)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.openai.com/v1/realtime/calls/rtc_call_live_123/accept'
    )
    expect(console.info).toHaveBeenCalledWith(
      '[openai/realtime-call]',
      expect.objectContaining({
        event: 'bell_live.openai_call_action',
        eventType: 'live.call.incoming',
        outcome: 'handled',
      })
    )
  })

  it('coalesces Realtime and Live webhook deliveries into one greeting', async () => {
    let processedAt: Date | null = null
    let calls = 0
    webhookEvents.findOrCreate.mockImplementation(async () => ({
      event: {
        id: 1,
        eventKey: `bell-live-greeting:${CALL_SID}`,
        eventType: 'bell-live-greeting',
        processingAt: null,
        processedAt,
        processedStepId: null,
        createdAt: new Date(),
      },
      inserted: calls++ === 0,
    }))
    webhookEvents.markProcessed.mockImplementation(async () => {
      processedAt = new Date()
      return true
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await POST(signedRequest(incomingEvent()))).toHaveProperty(
      'status',
      204
    )
    expect(await POST(signedRequest(liveIncomingEvent()))).toHaveProperty(
      'status',
      204
    )
    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    expect(webhookEvents.markProcessed).toHaveBeenCalledOnce()
  })

  it('retries one greeting that fails before response.create is sent', async () => {
    let calls = 0
    webhookEvents.findOrCreate.mockImplementation(async () => ({
      event: {
        id: 1,
        eventKey: `bell-live-greeting:${CALL_SID}`,
        eventType: 'bell-live-greeting',
        processingAt: null,
        processedAt: null,
        processedStepId: null,
        createdAt: new Date(),
      },
      inserted: calls++ === 0,
    }))
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
    vi.stubGlobal('fetch', fetchMock)
    FakeOpenAiRealtimeWebSocket.throwOnSend = true

    expect(await POST(signedRequest(incomingEvent()))).toHaveProperty(
      'status',
      502
    )
    expect(webhookEvents.release).toHaveBeenCalledOnce()

    FakeOpenAiRealtimeWebSocket.throwOnSend = false
    expect(await POST(signedRequest(liveIncomingEvent()))).toHaveProperty(
      'status',
      204
    )
    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    expect(webhookEvents.markProcessed).toHaveBeenCalledOnce()
  })

  it('rejects a bad OpenAI webhook signature before calling the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(signedRequest(incomingEvent(), false))

    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('declines an authentic OpenAI event with a tampered SIP invitation', async () => {
    const headers = sipHeaders().map((header) =>
      header.name === 'x-bp-token'
        ? { ...header, value: 'A'.repeat(43) }
        : header
    )
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(signedRequest(incomingEvent(headers)))

    expect(response.status).toBe(204)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.openai.com/v1/realtime/calls/rtc_call_123/reject'
    )
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      status_code: 603,
    })
  })

  it('acknowledges unrelated signed webhook event types', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(
      signedRequest({
        object: 'event',
        id: 'evt_other',
        type: 'response.completed',
        data: { id: 'resp_123' },
      })
    )

    expect(response.status).toBe(204)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed when Bell Live server configuration is incomplete', async () => {
    const request = signedRequest(incomingEvent())
    delete process.env.OPENAI_PROJECT_ID
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(request)

    expect(response.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retains safe OpenAI error diagnostics without logging the SIP headers', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              type: 'invalid_request_error',
              code: 'invalid_session',
              message: 'The Realtime session could not be established.',
            },
          }),
          {
            status: 400,
            headers: { 'x-request-id': 'req_failed_123' },
          }
        )
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(signedRequest(incomingEvent()))

    expect(response.status).toBe(502)
    expect(console.error).toHaveBeenCalledWith(
      '[openai/realtime-call]',
      expect.objectContaining({
        event: 'bell_live.openai_call_action',
        outcome: 'error',
        httpStatus: 400,
        openAiRequestId: 'req_failed_123',
        providerErrorCode: 'invalid_session',
        providerErrorType: 'invalid_request_error',
      })
    )
    const logged = JSON.stringify(
      vi.mocked(console.error).mock.calls.at(-1)?.[1]
    )
    expect(logged).not.toContain('providerErrorMessage')
    expect(logged).not.toContain('could not be established')
    expect(logged).not.toContain('x-bp-token')
    expect(logged).not.toContain('test-twilio-secret')
  })
})
