import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/openai/realtime-call/route'
import { bellLiveSipUri } from '@/lib/phone/bell-live'
import { FakeOpenAiRealtimeWebSocket } from '@/test/fake-openai-realtime-websocket'

const afterTasks = vi.hoisted(() => [] as Array<() => Promise<void>>)
const afterControl = vi.hoisted(() => ({ throwOnSchedule: false }))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: (task: (() => Promise<void>) | Promise<void>) => {
      if (afterControl.throwOnSchedule) {
        throw new Error('after unavailable')
      }
      afterTasks.push(() =>
        Promise.resolve(typeof task === 'function' ? task() : task)
      )
    },
  }
})

vi.mock('openai/realtime/ws', async () => {
  const { FakeOpenAiRealtimeWS } = await import(
    '@/test/fake-openai-realtime-websocket'
  )
  return { OpenAIRealtimeWS: FakeOpenAiRealtimeWS }
})

const webhookEvents = vi.hoisted(() => ({
  claimAttempt: vi.fn(),
  findOrCreate: vi.fn(),
  markProcessed: vi.fn(),
  markSideEffectObserved: vi.fn(),
}))

const transcriptNotifications = vi.hoisted(() => ({
  send: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db/queries/phone-webhook-events', () => ({
  claimPhoneWebhookEventAttempt: webhookEvents.claimAttempt,
  findOrCreatePhoneWebhookEvent: webhookEvents.findOrCreate,
  markPhoneWebhookEventProcessed: webhookEvents.markProcessed,
  markPhoneWebhookEventSideEffectObserved: webhookEvents.markSideEffectObserved,
}))

vi.mock('@/lib/phone/notifications', () => ({
  sendBellLiveTranscriptNotification: transcriptNotifications.send,
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

async function flushAfterTasks(): Promise<void> {
  await Promise.all(afterTasks.splice(0).map((task) => task()))
}

async function postAndFlush(request: Request): Promise<Response> {
  const result = await POST(request)
  await flushAfterTasks()
  return result
}

beforeEach(() => {
  afterTasks.length = 0
  afterControl.throwOnSchedule = false
  FakeOpenAiRealtimeWebSocket.afterContinuationEventBatches = []
  FakeOpenAiRealtimeWebSocket.afterContinuationEvents = []
  FakeOpenAiRealtimeWebSocket.connections = []
  FakeOpenAiRealtimeWebSocket.sockets = []
  FakeOpenAiRealtimeWebSocket.afterGreetingEvents = []
  FakeOpenAiRealtimeWebSocket.autoCloseAfterGreeting = true
  FakeOpenAiRealtimeWebSocket.emitAudioCleared = false
  FakeOpenAiRealtimeWebSocket.emitAudioStarted = true
  FakeOpenAiRealtimeWebSocket.emitAudioStopped = true
  FakeOpenAiRealtimeWebSocket.finalStatus = 'completed'
  FakeOpenAiRealtimeWebSocket.handshakeHttpStatus = null
  FakeOpenAiRealtimeWebSocket.handshakeHttpStatuses = []
  FakeOpenAiRealtimeWebSocket.sentEvents = []
  FakeOpenAiRealtimeWebSocket.throwOnContinuationSend = false
  FakeOpenAiRealtimeWebSocket.throwOnSend = false
  transcriptNotifications.send.mockClear()
  const createdAt = new Date()
  webhookEvents.findOrCreate.mockReset()
  webhookEvents.findOrCreate.mockResolvedValue({
    event: {
      id: 1,
      eventKey: `bell-live-greeting:${CALL_SID}`,
      eventType: 'bell-live-greeting',
      attemptCount: 0,
      processingAt: null,
      processedAt: null,
      processedStepId: null,
      createdAt,
    },
    inserted: true,
  })
  webhookEvents.claimAttempt.mockReset()
  webhookEvents.claimAttempt.mockResolvedValue({
    attemptNumber: 1,
    outcome: 'claimed',
    processingAt: new Date(),
  })
  webhookEvents.markProcessed.mockReset()
  webhookEvents.markProcessed.mockResolvedValue(true)
  webhookEvents.markSideEffectObserved.mockReset()
  webhookEvents.markSideEffectObserved.mockResolvedValue(true)
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
    expect(body.audio.input).toMatchObject({
      transcription: { model: 'gpt-live-transcribe' },
    })
    expect(afterTasks).toHaveLength(1)
    expect(webhookEvents.findOrCreate).not.toHaveBeenCalled()
    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(0)

    await flushAfterTasks()

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

  it('emails a complete, ordered transcript when the SIP sideband closes', async () => {
    FakeOpenAiRealtimeWebSocket.afterGreetingEvents = [
      {
        type: 'conversation.item.added',
        event_id: 'evt_caller_added',
        previous_item_id: null,
        item: {
          id: 'item_caller',
          type: 'message',
          role: 'user',
          content: [{ type: 'input_audio' }],
        },
      },
      {
        type: 'conversation.item.added',
        event_id: 'evt_tool_added',
        previous_item_id: 'item_caller',
        item: { id: 'item_tool', type: 'mcp_call' },
      },
      {
        type: 'conversation.item.added',
        event_id: 'evt_bell_added',
        previous_item_id: 'item_tool',
        item: {
          id: 'item_bell',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_audio' }],
        },
      },
      {
        type: 'response.output_audio_transcript.done',
        event_id: 'evt_bell_transcript',
        response_id: 'response_bell',
        item_id: 'item_bell',
        output_index: 0,
        content_index: 0,
        transcript: 'Here is the complete answer.',
      },
      {
        type: 'conversation.item.input_audio_transcription.completed',
        event_id: 'evt_caller_transcript',
        item_id: 'item_caller',
        content_index: 0,
        transcript: 'Tell me about that post.',
        usage: { type: 'duration', seconds: 1 },
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 }))
    )

    const result = await postAndFlush(signedRequest(incomingEvent()))

    expect(result.status).toBe(204)
    expect(transcriptNotifications.send).toHaveBeenCalledOnce()
    expect(transcriptNotifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        callSid: CALL_SID,
        inputFailureCount: 0,
        missingTranscriptCount: 0,
        observerCompleted: true,
        turns: [
          expect.objectContaining({
            role: 'caller',
            text: 'Tell me about that post.',
          }),
          expect.objectContaining({
            role: 'bell_ai',
            text: 'Here is the complete answer.',
          }),
        ],
      })
    )
    expect(console.info).toHaveBeenCalledWith(
      '[openai/realtime-call]',
      expect.objectContaining({
        event: 'bell_live.transcript_email',
        outcome: 'sent',
        transcriptCharacters: expect.any(Number),
        transcriptTurns: 2,
      })
    )
  })

  it('logs sanitized tool timing and recovers a tool-only terminal turn', async () => {
    FakeOpenAiRealtimeWebSocket.afterGreetingEvents = [
      {
        type: 'response.created',
        event_id: 'evt_private_response',
        response: { id: 'resp_private_response', status: 'in_progress' },
      },
      {
        type: 'response.output_item.added',
        event_id: 'evt_private_added',
        response_id: 'resp_private_response',
        output_index: 0,
        item: {
          id: 'item_private_tool',
          type: 'mcp_call',
          name: 'fetch',
          server_label: 'PRIVATE_SERVER',
          arguments: '{"id":"PRIVATE_ARGUMENT"}',
        },
      },
      {
        type: 'response.mcp_call.in_progress',
        event_id: 'evt_private_started',
        item_id: 'item_private_tool',
        output_index: 0,
      },
      {
        type: 'response.output_item.done',
        event_id: 'evt_private_done',
        response_id: 'resp_private_response',
        output_index: 0,
        item: {
          id: 'item_private_tool',
          type: 'mcp_call',
          name: 'fetch',
          server_label: 'PRIVATE_SERVER',
          arguments: '{"id":"PRIVATE_ARGUMENT"}',
          output: 'PRIVATE_OUTPUT',
        },
      },
      {
        type: 'response.done',
        event_id: 'evt_private_response_done',
        response: {
          id: 'resp_private_response',
          status: 'completed',
          output: [
            {
              id: 'item_private_tool',
              type: 'mcp_call',
              name: 'fetch',
              server_label: 'PRIVATE_SERVER',
              arguments: '{"id":"PRIVATE_ARGUMENT"}',
              output: 'PRIVATE_OUTPUT',
            },
          ],
        },
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 }))
    )

    const result = await postAndFlush(signedRequest(incomingEvent()))

    expect(result.status).toBe(204)
    expect(FakeOpenAiRealtimeWebSocket.sentEvents[1]).toMatchObject({
      type: 'response.create',
      response: {
        metadata: {
          purpose: 'bell_tool_continuation',
          tool_continuation_hop: '1',
        },
        tool_choice: 'auto',
      },
    })
    expect(console.info).toHaveBeenCalledWith(
      '[openai/realtime-call]',
      expect.objectContaining({
        event: 'bell_live.mcp_call',
        outcome: 'completed',
        tool: 'fetch',
      })
    )
    expect(console.info).toHaveBeenCalledWith(
      '[openai/realtime-call]',
      expect.objectContaining({
        event: 'bell_live.realtime_response',
        outputKind: 'tool_without_final_audio',
        purpose: 'normal',
        recoveryRequested: true,
      })
    )
    expect(console.info).toHaveBeenCalledWith(
      '[openai/realtime-call]',
      expect.objectContaining({
        callId: 'rtc_call_123',
        callSid: CALL_SID,
        event: 'bell_live.tool_continuation',
        eventType: 'realtime.call.incoming',
        outcome: 'requested',
      })
    )
    const lifecycleLogs = vi
      .mocked(console.info)
      .mock.calls.map((call) => call[1])
      .filter(
        (value) =>
          value &&
          typeof value === 'object' &&
          'event' in value &&
          typeof value.event === 'string' &&
          (value.event === 'bell_live.mcp_call' ||
            value.event === 'bell_live.realtime_response' ||
            value.event === 'bell_live.tool_continuation')
      )
    const serializedLifecycle = JSON.stringify(lifecycleLogs)
    expect(serializedLifecycle).not.toContain('PRIVATE_ARGUMENT')
    expect(serializedLifecycle).not.toContain('PRIVATE_OUTPUT')
    expect(serializedLifecycle).not.toContain('PRIVATE_SERVER')
    expect(serializedLifecycle).not.toContain('resp_private_response')
    expect(serializedLifecycle).not.toContain('item_private_tool')
  })

  it('accepts the equivalent Live incoming-call webhook into Realtime', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await postAndFlush(signedRequest(liveIncomingEvent()))

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
        attemptCount: 0,
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

    expect(await postAndFlush(signedRequest(incomingEvent()))).toHaveProperty(
      'status',
      204
    )
    expect(
      await postAndFlush(signedRequest(liveIncomingEvent()))
    ).toHaveProperty('status', 204)
    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    expect(webhookEvents.markProcessed).toHaveBeenCalledOnce()
  })

  it('recovers a lost checkpoint acknowledgement without replaying audio', async () => {
    let processedAt: Date | null = null
    let processedStepId: string | null = null
    webhookEvents.findOrCreate.mockImplementation(async () => ({
      event: {
        id: 1,
        eventKey: `bell-live-greeting:${CALL_SID}`,
        eventType: 'bell-live-greeting',
        attemptCount: processedAt ? 1 : 0,
        processingAt: null,
        processedAt,
        processedStepId,
        createdAt: new Date(),
      },
      inserted: !processedAt,
    }))
    webhookEvents.markProcessed.mockImplementation(
      async (_id, _lease, candidateStepId) => {
        expect(candidateStepId).toBe(`bell-live-greeting:${CALL_SID}`)
        if (processedStepId === candidateStepId) return true
        processedAt = new Date()
        processedStepId = candidateStepId
        throw new Error('Database acknowledgement lost after commit')
      }
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await postAndFlush(signedRequest(incomingEvent()))).toHaveProperty(
      'status',
      204
    )
    expect(
      await postAndFlush(signedRequest(liveIncomingEvent()))
    ).toHaveProperty('status', 204)

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    expect(webhookEvents.markProcessed).toHaveBeenCalledTimes(2)
    expect(webhookEvents.claimAttempt).toHaveBeenCalledOnce()
  })

  it('terminalizes played audio after lease checkpoint failures so redelivery cannot replay it', async () => {
    let processedAt: Date | null = null
    let calls = 0
    webhookEvents.findOrCreate.mockImplementation(async () => ({
      event: {
        id: 1,
        eventKey: `bell-live-greeting:${CALL_SID}`,
        eventType: 'bell-live-greeting',
        attemptCount: processedAt ? 1 : 0,
        processingAt: null,
        processedAt,
        processedStepId: processedAt ? `bell-live-greeting:${CALL_SID}` : null,
        createdAt: new Date(),
      },
      inserted: calls++ === 0,
    }))
    webhookEvents.markProcessed.mockResolvedValue(false)
    webhookEvents.markSideEffectObserved.mockImplementation(
      async (_id, candidateStepId) => {
        expect(candidateStepId).toBe(`bell-live-greeting:${CALL_SID}`)
        processedAt = new Date()
        return true
      }
    )
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
        .mockResolvedValueOnce(new Response(null, { status: 409 }))
    )

    expect(await postAndFlush(signedRequest(incomingEvent()))).toHaveProperty(
      'status',
      204
    )
    expect(
      await postAndFlush(signedRequest(liveIncomingEvent()))
    ).toHaveProperty('status', 204)

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    expect(webhookEvents.markProcessed).toHaveBeenCalledTimes(3)
    expect(webhookEvents.markSideEffectObserved).toHaveBeenCalledOnce()
    expect(webhookEvents.claimAttempt).toHaveBeenCalledOnce()
  })

  it('never reclaims played audio when every checkpoint write fails', async () => {
    let calls = 0
    webhookEvents.findOrCreate.mockImplementation(async () => ({
      event: {
        id: 1,
        eventKey: `bell-live-greeting:${CALL_SID}`,
        eventType: 'bell-live-greeting',
        attemptCount: calls > 0 ? 1 : 0,
        processingAt: null,
        processedAt: null,
        processedStepId: null,
        createdAt: new Date(),
      },
      inserted: calls++ === 0,
    }))
    webhookEvents.claimAttempt
      .mockResolvedValueOnce({
        attemptNumber: 1,
        outcome: 'claimed',
        processingAt: new Date(),
      })
      .mockResolvedValueOnce({ outcome: 'exhausted' })
    webhookEvents.markProcessed.mockResolvedValue(false)
    webhookEvents.markSideEffectObserved.mockResolvedValue(false)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
        .mockResolvedValueOnce(new Response(null, { status: 409 }))
    )

    expect(await postAndFlush(signedRequest(incomingEvent()))).toHaveProperty(
      'status',
      204
    )
    expect(
      await postAndFlush(signedRequest(liveIncomingEvent()))
    ).toHaveProperty('status', 204)

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    expect(webhookEvents.markProcessed).toHaveBeenCalledTimes(3)
    expect(webhookEvents.markSideEffectObserved).toHaveBeenCalledTimes(3)
    expect(webhookEvents.claimAttempt).toHaveBeenCalledTimes(2)
    expect(webhookEvents.claimAttempt).toHaveBeenNthCalledWith(1, 1, {
      leaseMs: 6_000,
      maxAttempts: 1,
    })
    expect(console.error).toHaveBeenCalledWith(
      '[openai/realtime-call]',
      expect.objectContaining({
        event: 'bell_live.openai_greeting',
        outcome: 'checkpoint_error',
      })
    )
  })

  it('keeps an accepted SIP call acknowledged when the optional opener fails', async () => {
    let processedAt: Date | null = null
    let calls = 0
    webhookEvents.findOrCreate.mockImplementation(async () => ({
      event: {
        id: 1,
        eventKey: `bell-live-greeting:${CALL_SID}`,
        eventType: 'bell-live-greeting',
        attemptCount: processedAt ? 1 : 0,
        processingAt: null,
        processedAt,
        processedStepId: processedAt ? `bell-live-greeting:${CALL_SID}` : null,
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
    FakeOpenAiRealtimeWebSocket.handshakeHttpStatus = 401

    expect(await postAndFlush(signedRequest(incomingEvent()))).toHaveProperty(
      'status',
      204
    )
    FakeOpenAiRealtimeWebSocket.handshakeHttpStatus = null
    expect(
      await postAndFlush(signedRequest(liveIncomingEvent()))
    ).toHaveProperty('status', 204)
    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(0)
    expect(webhookEvents.markProcessed).toHaveBeenCalledOnce()
    expect(webhookEvents.claimAttempt).toHaveBeenCalledOnce()
    expect(console.error).toHaveBeenCalledWith(
      '[openai/realtime-call]',
      expect.objectContaining({
        event: 'bell_live.openai_greeting',
        outcome: 'error',
        reason: 'socket_error',
        retryable: false,
        socketHttpStatus: 401,
        terminalCheckpointed: true,
      })
    )
  })

  it('keeps an accepted SIP call acknowledged when background scheduling fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 }))
    )
    afterControl.throwOnSchedule = true

    const result = await POST(signedRequest(incomingEvent()))

    expect(result.status).toBe(204)
    expect(afterTasks).toHaveLength(0)
    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(0)
    expect(console.error).toHaveBeenCalledWith(
      '[openai/realtime-call]',
      expect.objectContaining({
        event: 'bell_live.openai_greeting',
        outcome: 'schedule_error',
      })
    )
  })

  it('retries a sideband attach only before response.create is sent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 }))
    )
    FakeOpenAiRealtimeWebSocket.handshakeHttpStatuses = [503, null]

    const result = await postAndFlush(signedRequest(incomingEvent()))

    expect(result.status).toBe(204)
    expect(FakeOpenAiRealtimeWebSocket.connections).toHaveLength(2)
    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    expect(webhookEvents.claimAttempt).toHaveBeenCalledOnce()
    expect(console.info).toHaveBeenCalledWith(
      '[openai/realtime-call]',
      expect.objectContaining({
        event: 'bell_live.openai_greeting',
        outcome: 'retrying_socket',
        reason: 'socket_error',
        socketAttempt: 1,
      })
    )
  })

  it('does not retry after response.create may have been sent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 }))
    )
    FakeOpenAiRealtimeWebSocket.emitAudioStarted = false
    FakeOpenAiRealtimeWebSocket.emitAudioStopped = false
    FakeOpenAiRealtimeWebSocket.finalStatus = 'failed'

    const result = await postAndFlush(signedRequest(incomingEvent()))

    expect(result.status).toBe(204)
    expect(FakeOpenAiRealtimeWebSocket.connections).toHaveLength(1)
    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    expect(console.info).not.toHaveBeenCalledWith(
      '[openai/realtime-call]',
      expect.objectContaining({ outcome: 'retrying_socket' })
    )
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
