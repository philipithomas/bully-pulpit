import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptBellLiveCall,
  BellLiveGreetingError,
  type BellLiveLifecycleEvent,
  bellLiveSipUri,
  OpenAiCallActionError,
  PHONE_BELL_INITIAL_GREETING,
  PHONE_BELL_MAX_CALL_SECONDS,
  PHONE_BELL_REALTIME_DEFAULT_MODEL_ID,
  PHONE_BELL_REALTIME_MINI_MODEL_ID,
  phoneBellLiveConfigured,
  phoneBellRealtimeSession,
  rejectBellLiveCall,
  startBellLiveGreeting,
  verifiedBellLiveSipCallSid,
  verifyBellLiveSipInvitation,
} from '@/lib/phone/bell-live'
import { FakeOpenAiRealtimeWebSocket } from '@/test/fake-openai-realtime-websocket'

vi.mock('openai/realtime/ws', async () => {
  const { FakeOpenAiRealtimeWS } = await import(
    '@/test/fake-openai-realtime-websocket'
  )
  return { OpenAIRealtimeWS: FakeOpenAiRealtimeWS }
})

const NOW = new Date('2026-07-31T12:00:00Z')
const CALL_SID = 'CA1234567890abcdef1234567890abcdef'
const ORIGINAL_OPENAI_BASE_URL = process.env.OPENAI_BASE_URL

function headersFromSipUri(uri: string) {
  const query = new URLSearchParams(uri.slice(uri.indexOf('?') + 1))
  return Array.from(query, ([name, value]) => ({ name, value }))
}

beforeEach(() => {
  delete process.env.OPENAI_BASE_URL
  FakeOpenAiRealtimeWebSocket.afterContinuationEventBatches = []
  FakeOpenAiRealtimeWebSocket.afterContinuationEvents = []
  FakeOpenAiRealtimeWebSocket.connections = []
  FakeOpenAiRealtimeWebSocket.sockets = []
  FakeOpenAiRealtimeWebSocket.afterGreetingEvents = []
  FakeOpenAiRealtimeWebSocket.autoCloseAfterGreeting = false
  FakeOpenAiRealtimeWebSocket.emitAudioCleared = false
  FakeOpenAiRealtimeWebSocket.emitAudioStarted = true
  FakeOpenAiRealtimeWebSocket.emitAudioStopped = true
  FakeOpenAiRealtimeWebSocket.finalStatus = 'completed'
  FakeOpenAiRealtimeWebSocket.greetingEventDelayMs = 0
  FakeOpenAiRealtimeWebSocket.handshakeHttpStatus = null
  FakeOpenAiRealtimeWebSocket.handshakeHttpStatuses = []
  FakeOpenAiRealtimeWebSocket.sentEvents = []
  FakeOpenAiRealtimeWebSocket.throwOnContinuationSend = false
  FakeOpenAiRealtimeWebSocket.throwOnSend = false
  process.env.OPENAI_API_KEY = 'test-openai-key'
  process.env.OPENAI_PROJECT_ID = 'proj_test123'
  process.env.OPENAI_WEBHOOK_SECRET = 'whsec_test-webhook-secret'
  process.env.TWILIO_SECRET = 'test-twilio-secret'
})

afterEach(() => {
  vi.useRealTimers()
  delete process.env.OPENAI_API_KEY
  delete process.env.OPENAI_PROJECT_ID
  delete process.env.OPENAI_WEBHOOK_SECRET
  delete process.env.OPENAI_PHONE_REALTIME_MODEL
  delete process.env.TWILIO_SECRET
  if (ORIGINAL_OPENAI_BASE_URL) {
    process.env.OPENAI_BASE_URL = ORIGINAL_OPENAI_BASE_URL
  } else {
    delete process.env.OPENAI_BASE_URL
  }
  vi.unstubAllGlobals()
})

describe('Bell Live configuration', () => {
  it('enables the feature only with complete, valid server configuration', () => {
    expect(phoneBellLiveConfigured()).toBe(true)
    delete process.env.OPENAI_WEBHOOK_SECRET
    expect(phoneBellLiveConfigured()).toBe(false)
    process.env.OPENAI_WEBHOOK_SECRET = 'whsec_test-webhook-secret'
    process.env.OPENAI_PROJECT_ID = 'not-a-project-id'
    expect(phoneBellLiveConfigured()).toBe(false)
  })

  it('allows only the full and mini Realtime 2.1 models', () => {
    expect(phoneBellRealtimeSession().model).toBe(
      PHONE_BELL_REALTIME_DEFAULT_MODEL_ID
    )
    process.env.OPENAI_PHONE_REALTIME_MODEL = PHONE_BELL_REALTIME_MINI_MODEL_ID
    expect(phoneBellRealtimeSession().model).toBe(
      PHONE_BELL_REALTIME_MINI_MODEL_ID
    )
    process.env.OPENAI_PHONE_REALTIME_MODEL = 'gpt-live-1'
    expect(phoneBellLiveConfigured()).toBe(false)
    expect(() => phoneBellRealtimeSession()).toThrow('not supported')
  })
})

describe('Bell Live SIP invitation', () => {
  it('creates a bounded TLS URI with a valid short-lived HMAC', () => {
    const uri = bellLiveSipUri(CALL_SID, NOW)
    expect(uri).not.toBeNull()
    expect(uri).toMatch(
      /^sip:proj_test123@sip\.api\.openai\.com;transport=tls\?/
    )
    expect(uri?.length).toBeLessThanOrEqual(255)
    expect(uri).not.toContain('test-twilio-secret')
    expect(verifyBellLiveSipInvitation(headersFromSipUri(uri ?? ''), NOW)).toBe(
      true
    )
    expect(verifiedBellLiveSipCallSid(headersFromSipUri(uri ?? ''), NOW)).toBe(
      CALL_SID
    )
  })

  it('rejects tampered, duplicate, expired, and malformed invitations', () => {
    const uri = bellLiveSipUri(CALL_SID, NOW) ?? ''
    const headers = headersFromSipUri(uri)
    const tampered = headers.map((header) =>
      header.name === 'x-bp-call-sid'
        ? { ...header, value: 'CA9876543210abcdef1234567890abcdef' }
        : header
    )
    expect(verifyBellLiveSipInvitation(tampered, NOW)).toBe(false)
    expect(verifyBellLiveSipInvitation([...headers, headers[0]], NOW)).toBe(
      false
    )
    expect(
      verifyBellLiveSipInvitation(
        headers,
        new Date(NOW.getTime() + 6 * 60 * 1_000)
      )
    ).toBe(false)
    expect(bellLiveSipUri('invalid', NOW)).toBeNull()
  })

  it('ignores repeated standard SIP headers while matching custom names case-insensitively', () => {
    const uri = bellLiveSipUri(CALL_SID, NOW) ?? ''
    const headers = headersFromSipUri(uri).map((header) => ({
      name: header.name.toUpperCase(),
      value: header.value,
    }))
    headers.push({ name: 'Via', value: 'first' })
    headers.push({ name: 'Via', value: 'second' })
    expect(verifyBellLiveSipInvitation(headers, NOW)).toBe(true)
  })
})

describe('Bell Live Realtime session', () => {
  it('uses full Realtime at low reasoning with native audio and read-only archive MCP', () => {
    const session = phoneBellRealtimeSession()
    expect(session).toMatchObject({
      type: 'realtime',
      model: PHONE_BELL_REALTIME_DEFAULT_MODEL_ID,
      output_modalities: ['audio'],
      max_output_tokens: 'inf',
      parallel_tool_calls: false,
      reasoning: { effort: 'low' },
      audio: {
        input: {
          turn_detection: {
            type: 'semantic_vad',
            eagerness: 'high',
            create_response: true,
            interrupt_response: true,
          },
        },
      },
      tools: [
        {
          type: 'mcp',
          server_url: 'https://www.philipithomas.com/mcp',
          allowed_tools: ['search', 'fetch', 'list_posts'],
          require_approval: 'never',
        },
      ],
      tracing: null,
    })
    expect(PHONE_BELL_INITIAL_GREETING).toBe(
      'Hi, this is Bell AI. What can I help with?'
    )
    expect(session.instructions).toContain('You are Bell AI')
    expect(session.instructions).toContain(PHONE_BELL_INITIAL_GREETING)
    expect(session.instructions).toContain('say "Bell AI," never "Bell" alone')
    expect(session.instructions).toContain('long, complete answers are allowed')
    expect(session.instructions).toContain(
      'Never stop at a tool call, omit the answer, or end mid-thought'
    )
    expect(session.instructions).toContain(
      'Before the first archive tool call in every caller turn'
    )
    expect(session.instructions).toContain(
      'make exactly one brief nonverbal thinking sound: "Mm."'
    )
    expect(session.instructions).toContain(
      'Do not say any words about thinking, searching, checking, waiting'
    )
    expect(session.instructions).not.toContain("I'll look that up now")
    expect(session.instructions).toContain(
      'The phone call has a hard five-minute total limit'
    )
    expect(session.instructions).toContain(
      'do not begin a readback you cannot finish'
    )
    expect(session.instructions).toContain(
      'Topical questions always start with search'
    )
    expect(session.instructions).toContain(
      'Use list_posts only when the caller explicitly asks to list or browse'
    )
    expect(session.instructions).not.toContain('one to three short sentences')
    expect(PHONE_BELL_MAX_CALL_SECONDS).toBe(300)
    expect(session).not.toHaveProperty('service_tier')
    expect(session.audio.input.transcription).toMatchObject({
      model: 'gpt-live-transcribe',
      languages: ['en'],
      keywords: expect.arrayContaining(['Bell AI', 'Philip Ilic Thomas']),
    })
    expect(session.audio.input.transcription).not.toHaveProperty('language')
    expect(session.tools[0]).not.toHaveProperty('server_description')
    expect(session.tools[0]).not.toHaveProperty('allowed_callers')
  })

  it('accepts and rejects calls through the direct OpenAI call API', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(acceptBellLiveCall('rtc_call_123')).resolves.toMatchObject({
      action: 'accept',
      outcome: 'handled',
      status: 200,
    })
    await expect(rejectBellLiveCall('rtc_call_456')).resolves.toMatchObject({
      action: 'reject',
      outcome: 'handled',
      status: 200,
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.openai.com/v1/realtime/calls/rtc_call_123/accept',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-openai-key',
          'Content-Type': 'application/json',
          'OpenAI-Project': 'proj_test123',
        },
      })
    )
    const acceptBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body)
    ) as { model: string }
    expect(acceptBody.model).toBe(PHONE_BELL_REALTIME_DEFAULT_MODEL_ID)

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.openai.com/v1/realtime/calls/rtc_call_456/reject',
      expect.objectContaining({ method: 'POST' })
    )
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      status_code: 603,
    })
  })

  it('treats a conflict on a retried acceptance as already handled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 409 }))
    )
    await expect(acceptBellLiveCall('rtc_call_retry')).resolves.toMatchObject({
      action: 'accept',
      outcome: 'already_handled',
      status: 409,
    })
  })

  it('keeps bounded, redacted OpenAI diagnostics with the request ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                type: 'invalid_request_error',
                code: 'invalid_session',
                param: 'audio.input',
                message:
                  'Bearer secret-token rejected for +15551234567 at sip:test@example.com?x-bp-token=secret',
              },
            }),
            {
              status: 400,
              headers: { 'x-request-id': 'req_test123' },
            }
          )
      )
    )

    const error = await acceptBellLiveCall('rtc_call_error').catch(
      (value: unknown) => value
    )
    expect(error).toBeInstanceOf(OpenAiCallActionError)
    expect(error).toMatchObject({
      action: 'accept',
      reason: 'http_error',
      requestId: 'req_test123',
      status: 400,
      provider: {
        code: 'invalid_session',
        param: 'audio.input',
        type: 'invalid_request_error',
      },
    })
    const message = (error as OpenAiCallActionError).provider.message ?? ''
    expect(message).toContain('[REDACTED]')
    expect(message).toContain('[REDACTED_PHONE]')
    expect(message).not.toContain('secret-token')
    expect(message).not.toContain('+15551234567')
    expect(message).not.toContain('x-bp-token=secret')
  })

  it('starts Bell with a proactive sideband greeting', async () => {
    const greeting = await startBellLiveGreeting('rtc_call_greeting')
    expect(greeting).toMatchObject({
      audioStarted: true,
      durationMs: expect.any(Number),
      responseCheckpointed: true,
      responseCreated: true,
    })
    expect(FakeOpenAiRealtimeWebSocket.sockets[0]?.closed).toBe(false)
    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toEqual([
      {
        type: 'response.create',
        response: {
          instructions: `Say exactly: "${PHONE_BELL_INITIAL_GREETING}" Do not add anything else.`,
          max_output_tokens: 512,
          metadata: { purpose: 'bell_initial_greeting' },
          output_modalities: ['audio'],
        },
      },
    ])

    FakeOpenAiRealtimeWebSocket.sockets[0]?.closeFromServer()
    await expect(greeting.conversation).resolves.toMatchObject({
      observerCompleted: true,
      turns: [],
    })
  })

  it('waits for the result-bearing tool event before resuming the answer', async () => {
    const lifecycle: BellLiveLifecycleEvent[] = []
    FakeOpenAiRealtimeWebSocket.afterContinuationEvents = [
      {
        type: 'response.created',
        event_id: 'evt_continuation_created',
        response: {
          id: 'resp_continuation',
          status: 'in_progress',
          metadata: {
            purpose: 'bell_tool_continuation',
            tool_continuation_hop: '1',
            tool_result_ready: 'true',
          },
        },
      },
      {
        type: 'conversation.item.added',
        event_id: 'evt_continuation_item',
        previous_item_id: 'item_private_tool',
        item: {
          id: 'item_continuation_answer',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_audio' }],
        },
      },
      {
        type: 'output_audio_buffer.started',
        event_id: 'evt_continuation_audio',
        response_id: 'resp_continuation',
      },
      {
        type: 'response.output_audio_transcript.done',
        event_id: 'evt_continuation_transcript',
        response_id: 'resp_continuation',
        item_id: 'item_continuation_answer',
        output_index: 0,
        content_index: 0,
        transcript: 'Here is the recovered complete answer.',
      },
      {
        type: 'response.done',
        event_id: 'evt_continuation_done',
        response: {
          id: 'resp_continuation',
          status: 'completed',
          metadata: {
            purpose: 'bell_tool_continuation',
            tool_continuation_hop: '1',
            tool_result_ready: 'true',
          },
          output: [
            {
              id: 'item_continuation_answer',
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'output_audio',
                  transcript: 'Here is the recovered complete answer.',
                },
              ],
            },
          ],
        },
      },
    ]

    const greeting = await startBellLiveGreeting('rtc_call_greeting', {
      onLifecycleEvent: (event) => lifecycle.push(event),
    })
    const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
    socket?.emitServerEvent({
      type: 'mcp_list_tools.in_progress',
      event_id: 'evt_discovery_started',
      item_id: 'item_private_discovery',
    })
    socket?.emitServerEvent({
      type: 'mcp_list_tools.completed',
      event_id: 'evt_discovery_done',
      item_id: 'item_private_discovery',
    })
    socket?.emitServerEvent({
      type: 'response.created',
      event_id: 'evt_lookup_created',
      response: { id: 'resp_private_lookup', status: 'in_progress' },
    })
    socket?.emitServerEvent({
      type: 'response.output_item.added',
      event_id: 'evt_tool_added',
      response_id: 'resp_private_lookup',
      output_index: 1,
      item: {
        id: 'item_private_tool',
        type: 'mcp_call',
        name: 'search',
        server_label: 'philip_archive',
        arguments: '{"query":"PRIVATE_QUERY"}',
      },
    })
    socket?.emitServerEvent({
      type: 'response.done',
      event_id: 'evt_lookup_done',
      response: {
        id: 'resp_private_lookup',
        status: 'completed',
        output: [
          {
            id: 'item_private_preamble',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_audio', transcript: 'Mm.' }],
          },
          {
            id: 'item_private_tool',
            type: 'mcp_call',
            name: 'search',
            server_label: 'philip_archive',
            arguments: '{"query":"PRIVATE_QUERY"}',
          },
        ],
      },
    })

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    expect(lifecycle).toContainEqual(
      expect.objectContaining({
        event: 'bell_live.realtime_response',
        outcome: 'completed',
        outputKind: 'tool_without_final_audio',
        purpose: 'normal',
        recoveryQueued: true,
        recoveryRequested: false,
        toolCallCount: 1,
      })
    )

    socket?.emitServerEvent({
      type: 'response.mcp_call.in_progress',
      event_id: 'evt_tool_started',
      item_id: 'item_private_tool',
      output_index: 1,
    })
    socket?.emitServerEvent({
      type: 'response.mcp_call.completed',
      event_id: 'evt_tool_completed',
      item_id: 'item_private_tool',
      output_index: 1,
    })
    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)

    socket?.emitServerEvent({
      type: 'response.output_item.done',
      event_id: 'evt_tool_done',
      response_id: 'resp_private_lookup',
      output_index: 1,
      item: {
        id: 'item_private_tool',
        type: 'mcp_call',
        name: 'search',
        server_label: 'philip_archive',
        arguments: '{"query":"PRIVATE_QUERY"}',
        output: 'PRIVATE_TOOL_OUTPUT',
      },
    })

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(2)
    expect(FakeOpenAiRealtimeWebSocket.sentEvents[1]).toMatchObject({
      event_id: expect.stringMatching(/^evt_bell_tool_/),
      type: 'response.create',
      response: {
        instructions: expect.stringContaining('You are Bell AI'),
        max_output_tokens: 'inf',
        metadata: {
          purpose: 'bell_tool_continuation',
          tool_continuation_hop: '1',
          tool_result_ready: 'true',
        },
        output_modalities: ['audio'],
        tool_choice: 'auto',
      },
    })
    expect(
      (FakeOpenAiRealtimeWebSocket.sentEvents[1] as { response: object })
        .response
    ).not.toHaveProperty('tools')

    await vi.waitFor(() => {
      expect(lifecycle).toContainEqual(
        expect.objectContaining({
          event: 'bell_live.audio_output',
          outcome: 'started',
          purpose: 'tool_continuation',
          toolCompletedBeforeStart: true,
        })
      )
    })
    expect(lifecycle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'bell_live.mcp_discovery',
          outcome: 'completed',
        }),
        expect.objectContaining({
          event: 'bell_live.mcp_call',
          outcome: 'completed',
          tool: 'search',
        }),
        expect.objectContaining({
          event: 'bell_live.tool_continuation',
          hop: 1,
          outcome: 'requested',
          toolsAllowed: true,
        }),
      ])
    )
    const completedIndex = lifecycle.findIndex(
      (event) =>
        event.event === 'bell_live.mcp_call' && event.outcome === 'completed'
    )
    const continuationIndex = lifecycle.findIndex(
      (event) =>
        event.event === 'bell_live.tool_continuation' &&
        event.outcome === 'requested'
    )
    expect(completedIndex).toBeGreaterThanOrEqual(0)
    expect(continuationIndex).toBeGreaterThan(completedIndex)
    expect(
      lifecycle.filter(
        (event) =>
          event.event === 'bell_live.mcp_call' && event.outcome === 'completed'
      )
    ).toHaveLength(1)
    expect(lifecycle).toContainEqual(
      expect.objectContaining({
        event: 'bell_live.realtime_response',
        outcome: 'completed',
        outputKind: 'audio',
        purpose: 'tool_continuation',
        recoveryQueued: false,
        recoveryRequested: false,
      })
    )
    const serializedLifecycle = JSON.stringify(lifecycle)
    expect(serializedLifecycle).not.toContain('PRIVATE_QUERY')
    expect(serializedLifecycle).not.toContain('PRIVATE_TOOL_OUTPUT')
    expect(serializedLifecycle).not.toContain('resp_private_lookup')
    expect(serializedLifecycle).not.toContain('item_private_tool')
    expect(serializedLifecycle).not.toContain('item_private_discovery')

    socket?.closeFromServer()
    await expect(greeting.conversation).resolves.toMatchObject({
      turns: [
        expect.objectContaining({
          role: 'bell_ai',
          text: 'Here is the recovered complete answer.',
        }),
      ],
    })
  })

  it('resumes once when the tool result arrives before response.done', async () => {
    FakeOpenAiRealtimeWebSocket.afterGreetingEvents = [
      {
        type: 'response.output_item.done',
        event_id: 'evt_tool_output_done',
        response_id: 'resp_tool',
        output_index: 0,
        item: {
          id: 'item_tool',
          type: 'mcp_call',
          name: 'search',
          output: 'result',
        },
      },
      {
        type: 'response.done',
        event_id: 'evt_tool_response_done',
        response: {
          id: 'resp_tool',
          status: 'completed',
          output: [
            {
              id: 'item_tool',
              type: 'mcp_call',
              name: 'search',
              output: 'result',
            },
          ],
        },
      },
    ]

    const greeting = await startBellLiveGreeting('rtc_call_greeting')

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(2)
    expect(FakeOpenAiRealtimeWebSocket.sentEvents[1]).toMatchObject({
      response: {
        metadata: {
          purpose: 'bell_tool_continuation',
          tool_continuation_hop: '1',
          tool_result_ready: 'true',
        },
      },
    })
    FakeOpenAiRealtimeWebSocket.sockets[0]?.closeFromServer()
    await greeting.conversation
  })

  it('waits for a failed tool final item before resuming', async () => {
    const lifecycle: BellLiveLifecycleEvent[] = []
    const greeting = await startBellLiveGreeting('rtc_call_greeting', {
      onLifecycleEvent: (event) => lifecycle.push(event),
    })
    const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
    socket?.emitServerEvent({
      type: 'response.done',
      event_id: 'evt_tool_response_done',
      response: {
        id: 'resp_tool',
        status: 'completed',
        output: [
          {
            id: 'item_tool',
            type: 'mcp_call',
            name: 'fetch',
          },
        ],
      },
    })
    socket?.emitServerEvent({
      type: 'response.mcp_call.failed',
      event_id: 'evt_tool_failed',
      item_id: 'item_tool',
      output_index: 0,
    })

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    socket?.emitServerEvent({
      type: 'response.output_item.done',
      event_id: 'evt_tool_item_done_without_result',
      response_id: 'resp_tool',
      output_index: 0,
      item: {
        id: 'item_tool',
        type: 'mcp_call',
        name: 'fetch',
      },
    })
    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    socket?.emitServerEvent({
      type: 'response.output_item.done',
      event_id: 'evt_tool_output_done',
      response_id: 'resp_tool',
      output_index: 0,
      item: {
        id: 'item_tool',
        type: 'mcp_call',
        name: 'fetch',
        error: { type: 'mcp_error' },
      },
    })

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(2)
    expect(
      lifecycle.filter((event) => event.event === 'bell_live.mcp_call')
    ).toEqual([
      expect.objectContaining({
        event: 'bell_live.mcp_call',
        outcome: 'failed',
        tool: 'fetch',
      }),
    ])
    FakeOpenAiRealtimeWebSocket.sockets[0]?.closeFromServer()
    await greeting.conversation
  })

  it('does not pass the result barrier with a missing tool item id', async () => {
    const greeting = await startBellLiveGreeting('rtc_call_greeting')
    const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
    socket?.emitServerEvent({
      type: 'response.done',
      event_id: 'evt_tool_response_done',
      response: {
        id: 'resp_tool',
        status: 'completed',
        output: [{ type: 'mcp_call', name: 'search' }],
      },
    })

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    socket?.emitServerEvent({
      type: 'response.output_item.done',
      event_id: 'evt_tool_output_done',
      response_id: 'resp_tool',
      output_index: 0,
      item: {
        id: 'item_tool',
        type: 'mcp_call',
        name: 'search',
        output: 'result',
      },
    })

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(2)
    FakeOpenAiRealtimeWebSocket.sockets[0]?.closeFromServer()
    await greeting.conversation
  })

  it('waits for every tool result in the completed response', async () => {
    const greeting = await startBellLiveGreeting('rtc_call_greeting')
    const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
    socket?.emitServerEvent({
      type: 'response.done',
      event_id: 'evt_tools_response_done',
      response: {
        id: 'resp_tools',
        status: 'completed',
        output: [
          { id: 'item_search', type: 'mcp_call', name: 'search' },
          { id: 'item_fetch', type: 'mcp_call', name: 'fetch' },
        ],
      },
    })
    socket?.emitServerEvent({
      type: 'response.output_item.done',
      event_id: 'evt_search_done',
      response_id: 'resp_tools',
      output_index: 0,
      item: {
        id: 'item_search',
        type: 'mcp_call',
        name: 'search',
        output: 'search result',
      },
    })

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    socket?.emitServerEvent({
      type: 'response.output_item.done',
      event_id: 'evt_fetch_done',
      response_id: 'resp_tools',
      output_index: 1,
      item: {
        id: 'item_fetch',
        type: 'mcp_call',
        name: 'fetch',
        output: 'full post',
      },
    })

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(2)
    FakeOpenAiRealtimeWebSocket.sockets[0]?.closeFromServer()
    await greeting.conversation
  })

  it('supersedes a queued continuation when a newer response starts', async () => {
    const lifecycle: BellLiveLifecycleEvent[] = []
    const greeting = await startBellLiveGreeting('rtc_call_greeting', {
      onLifecycleEvent: (event) => lifecycle.push(event),
    })
    const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
    socket?.emitServerEvent({
      type: 'response.done',
      event_id: 'evt_old_response_done',
      response: {
        id: 'resp_old',
        status: 'completed',
        output: [{ id: 'item_old_tool', type: 'mcp_call', name: 'search' }],
      },
    })
    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)

    socket?.emitServerEvent({
      type: 'response.created',
      event_id: 'evt_new_response_created',
      response: { id: 'resp_new', status: 'in_progress' },
    })
    expect(lifecycle).toContainEqual({
      event: 'bell_live.tool_continuation',
      hop: 1,
      outcome: 'superseded',
      toolsAllowed: true,
    })
    socket?.emitServerEvent({
      type: 'response.output_item.done',
      event_id: 'evt_old_tool_done',
      response_id: 'resp_old',
      output_index: 0,
      item: {
        id: 'item_old_tool',
        type: 'mcp_call',
        name: 'search',
        output: 'old result',
      },
    })
    socket?.emitServerEvent({
      type: 'response.done',
      event_id: 'evt_new_response_done',
      response: {
        id: 'resp_new',
        status: 'completed',
        output: [
          {
            id: 'item_new_answer',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_audio', transcript: 'New answer.' }],
          },
        ],
      },
    })

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    socket?.closeFromServer()
    await greeting.conversation
  })

  it('does not recover a tool turn after the caller barges in', async () => {
    const lifecycle: BellLiveLifecycleEvent[] = []
    const greeting = await startBellLiveGreeting('rtc_call_greeting', {
      onLifecycleEvent: (event) => lifecycle.push(event),
    })
    const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
    socket?.emitServerEvent({
      type: 'input_audio_buffer.speech_started',
      event_id: 'evt_first_caller_turn',
      audio_start_ms: 0,
      item_id: 'item_first_caller',
    })
    socket?.emitServerEvent({
      type: 'response.created',
      event_id: 'evt_tool_response_created',
      response: { id: 'resp_tool', status: 'in_progress' },
    })
    socket?.emitServerEvent({
      type: 'input_audio_buffer.speech_started',
      event_id: 'evt_caller_barge_in',
      audio_start_ms: 1_000,
      item_id: 'item_second_caller',
    })
    socket?.emitServerEvent({
      type: 'response.done',
      event_id: 'evt_tool_response_done',
      response: {
        id: 'resp_tool',
        status: 'completed',
        output: [{ id: 'item_tool', type: 'mcp_call', name: 'search' }],
      },
    })
    socket?.emitServerEvent({
      type: 'response.output_item.done',
      event_id: 'evt_tool_done',
      response_id: 'resp_tool',
      output_index: 0,
      item: {
        id: 'item_tool',
        type: 'mcp_call',
        name: 'search',
        output: 'stale result',
      },
    })

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    expect(lifecycle).toContainEqual({
      event: 'bell_live.tool_continuation',
      hop: 1,
      outcome: 'superseded',
      toolsAllowed: true,
    })
    socket?.closeFromServer()
    await greeting.conversation
  })

  it('logs a queued continuation as abandoned when the call ends', async () => {
    const lifecycle: BellLiveLifecycleEvent[] = []
    const greeting = await startBellLiveGreeting('rtc_call_greeting', {
      onLifecycleEvent: (event) => lifecycle.push(event),
    })
    const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
    socket?.emitServerEvent({
      type: 'response.done',
      event_id: 'evt_tool_response_done',
      response: {
        id: 'resp_tool',
        status: 'completed',
        output: [{ id: 'item_tool', type: 'mcp_call', name: 'search' }],
      },
    })
    socket?.closeFromServer()
    await greeting.conversation

    expect(lifecycle).toContainEqual({
      event: 'bell_live.tool_continuation',
      hop: 1,
      outcome: 'abandoned',
      toolsAllowed: true,
    })
  })

  it('allows a bounded multi-tool chain before forcing a spoken answer', async () => {
    const lifecycle: BellLiveLifecycleEvent[] = []
    FakeOpenAiRealtimeWebSocket.afterContinuationEventBatches = [
      [
        {
          type: 'response.created',
          event_id: 'evt_continuation_one_created',
          response: {
            id: 'resp_continuation_one',
            status: 'in_progress',
            metadata: {
              purpose: 'bell_tool_continuation',
              tool_continuation_hop: '1',
              tool_result_ready: 'true',
            },
          },
        },
        {
          type: 'response.output_item.added',
          event_id: 'evt_search_added',
          response_id: 'resp_continuation_one',
          output_index: 0,
          item: {
            id: 'item_search',
            type: 'mcp_call',
            name: 'search',
          },
        },
        {
          type: 'response.done',
          event_id: 'evt_continuation_one_done',
          response: {
            id: 'resp_continuation_one',
            status: 'completed',
            metadata: {
              purpose: 'bell_tool_continuation',
              tool_continuation_hop: '1',
              tool_result_ready: 'true',
            },
            output: [
              {
                id: 'item_search',
                type: 'mcp_call',
                name: 'search',
              },
            ],
          },
        },
        {
          type: 'response.mcp_call.in_progress',
          event_id: 'evt_search_started',
          item_id: 'item_search',
          output_index: 0,
        },
        {
          type: 'response.mcp_call.completed',
          event_id: 'evt_search_completed',
          item_id: 'item_search',
          output_index: 0,
        },
        {
          type: 'response.output_item.done',
          event_id: 'evt_search_done',
          response_id: 'resp_continuation_one',
          output_index: 0,
          item: {
            id: 'item_search',
            type: 'mcp_call',
            name: 'search',
            output: 'search result',
          },
        },
      ],
      [
        {
          type: 'response.created',
          event_id: 'evt_continuation_two_created',
          response: {
            id: 'resp_continuation_two',
            status: 'in_progress',
            metadata: {
              purpose: 'bell_tool_continuation',
              tool_continuation_hop: '2',
              tool_result_ready: 'true',
            },
          },
        },
        {
          type: 'response.output_item.added',
          event_id: 'evt_fetch_added',
          response_id: 'resp_continuation_two',
          output_index: 0,
          item: {
            id: 'item_fetch',
            type: 'mcp_call',
            name: 'fetch',
          },
        },
        {
          type: 'response.done',
          event_id: 'evt_continuation_two_done',
          response: {
            id: 'resp_continuation_two',
            status: 'completed',
            metadata: {
              purpose: 'bell_tool_continuation',
              tool_continuation_hop: '2',
              tool_result_ready: 'true',
            },
            output: [
              {
                id: 'item_fetch',
                type: 'mcp_call',
                name: 'fetch',
              },
            ],
          },
        },
        {
          type: 'response.mcp_call.in_progress',
          event_id: 'evt_fetch_started',
          item_id: 'item_fetch',
          output_index: 0,
        },
        {
          type: 'response.mcp_call.completed',
          event_id: 'evt_fetch_completed',
          item_id: 'item_fetch',
          output_index: 0,
        },
        {
          type: 'response.output_item.done',
          event_id: 'evt_fetch_done',
          response_id: 'resp_continuation_two',
          output_index: 0,
          item: {
            id: 'item_fetch',
            type: 'mcp_call',
            name: 'fetch',
            output: 'full post',
          },
        },
      ],
      [
        {
          type: 'response.created',
          event_id: 'evt_final_created',
          response: {
            id: 'resp_final',
            status: 'in_progress',
            metadata: {
              purpose: 'bell_tool_final_answer',
              tool_continuation_hop: '3',
              tool_result_ready: 'true',
            },
          },
        },
        {
          type: 'output_audio_buffer.started',
          event_id: 'evt_final_audio',
          response_id: 'resp_final',
        },
        {
          type: 'response.done',
          event_id: 'evt_final_done',
          response: {
            id: 'resp_final',
            status: 'completed',
            metadata: {
              purpose: 'bell_tool_final_answer',
              tool_continuation_hop: '3',
              tool_result_ready: 'true',
            },
            output: [
              {
                id: 'item_final_answer',
                type: 'message',
                role: 'assistant',
                content: [
                  {
                    type: 'output_audio',
                    transcript: 'Here is the complete answer.',
                  },
                ],
              },
            ],
          },
        },
      ],
    ]
    FakeOpenAiRealtimeWebSocket.afterGreetingEvents = [
      {
        type: 'response.created',
        event_id: 'evt_initial_tool_created',
        response: { id: 'resp_initial_tool', status: 'in_progress' },
      },
      {
        type: 'response.output_item.added',
        event_id: 'evt_list_posts_added',
        response_id: 'resp_initial_tool',
        output_index: 0,
        item: {
          id: 'item_list_posts',
          type: 'mcp_call',
          name: 'list_posts',
        },
      },
      {
        type: 'response.done',
        event_id: 'evt_initial_tool_done',
        response: {
          id: 'resp_initial_tool',
          status: 'completed',
          output: [
            {
              id: 'item_list_posts',
              type: 'mcp_call',
              name: 'list_posts',
            },
          ],
        },
      },
      {
        type: 'response.mcp_call.in_progress',
        event_id: 'evt_list_posts_started',
        item_id: 'item_list_posts',
        output_index: 0,
      },
      {
        type: 'response.mcp_call.completed',
        event_id: 'evt_list_posts_completed',
        item_id: 'item_list_posts',
        output_index: 0,
      },
      {
        type: 'response.output_item.done',
        event_id: 'evt_list_posts_done',
        response_id: 'resp_initial_tool',
        output_index: 0,
        item: {
          id: 'item_list_posts',
          type: 'mcp_call',
          name: 'list_posts',
          output: 'post list',
        },
      },
    ]

    const greeting = await startBellLiveGreeting('rtc_call_greeting', {
      onLifecycleEvent: (event) => lifecycle.push(event),
    })

    await vi.waitFor(() => {
      expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(4)
    })
    const continuationResponses = FakeOpenAiRealtimeWebSocket.sentEvents.slice(
      1
    ) as Array<{ response: Record<string, unknown> }>
    expect(
      continuationResponses.map(({ response }) => response.metadata)
    ).toEqual([
      {
        purpose: 'bell_tool_continuation',
        tool_continuation_hop: '1',
        tool_result_ready: 'true',
      },
      {
        purpose: 'bell_tool_continuation',
        tool_continuation_hop: '2',
        tool_result_ready: 'true',
      },
      {
        purpose: 'bell_tool_final_answer',
        tool_continuation_hop: '3',
        tool_result_ready: 'true',
      },
    ])
    expect(continuationResponses[0]?.response).toMatchObject({
      tool_choice: 'auto',
    })
    expect(continuationResponses[0]?.response).not.toHaveProperty('tools')
    expect(continuationResponses[1]?.response).toMatchObject({
      tool_choice: 'auto',
    })
    expect(continuationResponses[1]?.response).not.toHaveProperty('tools')
    expect(continuationResponses[2]?.response).toMatchObject({
      tool_choice: 'none',
      tools: [],
    })
    expect(
      lifecycle.filter((event) => event.event === 'bell_live.tool_continuation')
    ).toEqual([
      {
        event: 'bell_live.tool_continuation',
        hop: 1,
        outcome: 'requested',
        toolsAllowed: true,
      },
      {
        event: 'bell_live.tool_continuation',
        hop: 2,
        outcome: 'requested',
        toolsAllowed: true,
      },
      {
        event: 'bell_live.tool_continuation',
        hop: 3,
        outcome: 'requested',
        toolsAllowed: false,
      },
    ])

    FakeOpenAiRealtimeWebSocket.sockets[0]?.closeFromServer()
    await greeting.conversation
  })

  it('does not duplicate a continuation for repeated response and tool events', async () => {
    const toolDone = {
      type: 'response.done',
      event_id: 'evt_tool_done',
      response: {
        id: 'resp_tool',
        status: 'completed',
        output: [
          {
            id: 'item_tool',
            type: 'mcp_call',
            name: 'search',
            output: 'result',
          },
        ],
      },
    }
    const toolOutputDone = {
      type: 'response.output_item.done',
      event_id: 'evt_tool_output_done',
      response_id: 'resp_tool',
      output_index: 0,
      item: {
        id: 'item_tool',
        type: 'mcp_call',
        name: 'search',
        output: 'result',
      },
    }
    FakeOpenAiRealtimeWebSocket.afterGreetingEvents = [
      toolDone,
      toolDone,
      toolOutputDone,
      toolOutputDone,
      {
        type: 'response.mcp_call.completed',
        event_id: 'evt_tool_completed',
        item_id: 'item_tool',
        output_index: 0,
      },
    ]

    const greeting = await startBellLiveGreeting('rtc_call_greeting')

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(2)
    FakeOpenAiRealtimeWebSocket.sockets[0]?.closeFromServer()
    await greeting.conversation
  })

  it('fails malformed continuation metadata closed into a final answer', async () => {
    FakeOpenAiRealtimeWebSocket.afterGreetingEvents = [
      {
        type: 'response.done',
        event_id: 'evt_tool_done',
        response: {
          id: 'resp_tool',
          status: 'completed',
          metadata: { purpose: 'bell_tool_continuation' },
          output: [
            {
              id: 'item_tool',
              type: 'mcp_call',
              name: 'fetch',
              output: 'result',
            },
          ],
        },
      },
      {
        type: 'response.output_item.done',
        event_id: 'evt_tool_output_done',
        response_id: 'resp_tool',
        output_index: 0,
        item: {
          id: 'item_tool',
          type: 'mcp_call',
          name: 'fetch',
          output: 'result',
        },
      },
    ]

    const greeting = await startBellLiveGreeting('rtc_call_greeting')

    expect(FakeOpenAiRealtimeWebSocket.sentEvents[1]).toMatchObject({
      response: {
        metadata: {
          purpose: 'bell_tool_final_answer',
          tool_continuation_hop: '3',
          tool_result_ready: 'true',
        },
        tool_choice: 'none',
        tools: [],
      },
    })
    FakeOpenAiRealtimeWebSocket.sockets[0]?.closeFromServer()
    await greeting.conversation
  })

  it('logs a continuation send failure emitted by the Realtime SDK', async () => {
    const lifecycle: BellLiveLifecycleEvent[] = []
    const greeting = await startBellLiveGreeting('rtc_call_greeting', {
      onLifecycleEvent: (event) => lifecycle.push(event),
    })
    const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
    FakeOpenAiRealtimeWebSocket.throwOnContinuationSend = true
    socket?.emitServerEvent({
      type: 'response.created',
      event_id: 'evt_tool_created',
      response: { id: 'resp_tool', status: 'in_progress' },
    })
    socket?.emitServerEvent({
      type: 'response.done',
      event_id: 'evt_tool_done',
      response: {
        id: 'resp_tool',
        status: 'completed',
        output: [
          {
            id: 'item_tool',
            type: 'mcp_call',
            name: 'search',
            output: 'result',
          },
        ],
      },
    })

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    socket?.emitServerEvent({
      type: 'response.output_item.done',
      event_id: 'evt_tool_output_done',
      response_id: 'resp_tool',
      output_index: 0,
      item: {
        id: 'item_tool',
        type: 'mcp_call',
        name: 'search',
        output: 'result',
      },
    })

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    expect(lifecycle).toContainEqual({
      event: 'bell_live.tool_continuation',
      hop: 1,
      outcome: 'failed',
      toolsAllowed: true,
    })
    expect(lifecycle).toContainEqual(
      expect.objectContaining({
        event: 'bell_live.realtime_response',
        recoveryQueued: true,
        recoveryRequested: false,
      })
    )
    expect(lifecycle).toContainEqual(
      expect.objectContaining({
        event: 'bell_live.observer',
        outcome: 'failed',
        reason: 'socket_error',
      })
    )

    socket?.closeFromServer()
    await greeting.conversation
  })

  it('logs a successful continuation after an earlier observer error', async () => {
    const lifecycle: BellLiveLifecycleEvent[] = []
    const greeting = await startBellLiveGreeting('rtc_call_greeting', {
      onLifecycleEvent: (event) => lifecycle.push(event),
    })
    const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
    socket?.emitServerEvent({
      type: 'error',
      event_id: 'evt_prior_error',
      error: {
        code: 'prior_error',
        message: 'A nonfatal error happened before the next caller turn.',
        type: 'server_error',
      },
    })
    socket?.emitServerEvent({
      type: 'response.created',
      event_id: 'evt_tool_created',
      response: { id: 'resp_tool', status: 'in_progress' },
    })
    socket?.emitServerEvent({
      type: 'response.done',
      event_id: 'evt_tool_done',
      response: {
        id: 'resp_tool',
        status: 'completed',
        output: [
          {
            id: 'item_tool',
            type: 'mcp_call',
            name: 'search',
            output: 'result',
          },
        ],
      },
    })

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    socket?.emitServerEvent({
      type: 'response.output_item.done',
      event_id: 'evt_tool_output_done',
      response_id: 'resp_tool',
      output_index: 0,
      item: {
        id: 'item_tool',
        type: 'mcp_call',
        name: 'search',
        output: 'result',
      },
    })

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(2)
    expect(lifecycle).toContainEqual({
      event: 'bell_live.tool_continuation',
      hop: 1,
      outcome: 'requested',
      toolsAllowed: true,
    })
    expect(lifecycle).toContainEqual(
      expect.objectContaining({
        event: 'bell_live.realtime_response',
        recoveryQueued: true,
        recoveryRequested: false,
      })
    )

    socket?.closeFromServer()
    await greeting.conversation
  })

  it('does not duplicate a complete spoken answer after a tool result', async () => {
    const lifecycle: BellLiveLifecycleEvent[] = []
    FakeOpenAiRealtimeWebSocket.afterGreetingEvents = [
      {
        type: 'response.created',
        event_id: 'evt_lookup_created',
        response: { id: 'resp_lookup', status: 'in_progress' },
      },
      {
        type: 'response.done',
        event_id: 'evt_lookup_done',
        response: {
          id: 'resp_lookup',
          status: 'completed',
          output: [
            {
              id: 'item_preamble',
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_audio', transcript: 'Mm.' }],
            },
            {
              id: 'item_tool',
              type: 'mcp_call',
              name: 'fetch',
              server_label: 'philip_archive',
              arguments: '{}',
              output: 'result',
            },
            {
              id: 'item_answer',
              type: 'message',
              role: 'assistant',
              content: [
                { type: 'output_audio', transcript: 'Here is the answer.' },
              ],
            },
          ],
        },
      },
    ]

    const greeting = await startBellLiveGreeting('rtc_call_greeting', {
      onLifecycleEvent: (event) => lifecycle.push(event),
    })

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    expect(lifecycle).toContainEqual(
      expect.objectContaining({
        event: 'bell_live.realtime_response',
        outputKind: 'mixed',
        purpose: 'normal',
        recoveryRequested: false,
        toolCallCount: 1,
      })
    )

    FakeOpenAiRealtimeWebSocket.sockets[0]?.closeFromServer()
    await greeting.conversation
  })

  it('logs an abandoned response when the caller hangs up after a tool', async () => {
    const lifecycle: BellLiveLifecycleEvent[] = []
    FakeOpenAiRealtimeWebSocket.afterGreetingEvents = [
      {
        type: 'response.created',
        event_id: 'evt_lookup_created',
        response: { id: 'resp_lookup', status: 'in_progress' },
      },
      {
        type: 'output_audio_buffer.started',
        event_id: 'evt_preamble_audio',
        response_id: 'resp_lookup',
      },
      {
        type: 'response.output_item.added',
        event_id: 'evt_tool_added',
        response_id: 'resp_lookup',
        output_index: 1,
        item: {
          id: 'item_tool',
          type: 'mcp_call',
          name: 'list_posts',
          server_label: 'philip_archive',
          arguments: '{"cursor":"PRIVATE_ARGUMENT"}',
        },
      },
      {
        type: 'response.mcp_call.in_progress',
        event_id: 'evt_tool_started',
        item_id: 'item_tool',
        output_index: 1,
      },
      {
        type: 'response.mcp_call.completed',
        event_id: 'evt_tool_completed',
        item_id: 'item_tool',
        output_index: 1,
      },
    ]

    const greeting = await startBellLiveGreeting('rtc_call_greeting', {
      onLifecycleEvent: (event) => lifecycle.push(event),
    })
    FakeOpenAiRealtimeWebSocket.sockets[0]?.closeFromServer()
    await greeting.conversation

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    expect(lifecycle).toContainEqual(
      expect.objectContaining({
        event: 'bell_live.audio_output',
        outcome: 'started',
        purpose: 'normal',
        toolCompletedBeforeStart: false,
      })
    )
    expect(lifecycle).toContainEqual(
      expect.objectContaining({
        event: 'bell_live.realtime_response',
        outcome: 'abandoned',
        outputKind: 'tool_without_final_audio',
        purpose: 'normal',
        recoveryRequested: false,
        toolCallCount: 1,
      })
    )
    expect(lifecycle).toContainEqual({
      event: 'bell_live.sideband',
      outcome: 'completed',
      socketCloseCode: 1_000,
    })
    expect(JSON.stringify(lifecycle)).not.toContain('PRIVATE_ARGUMENT')
  })

  it.each([
    ['cancelled', undefined],
    ['failed', undefined],
    ['incomplete', undefined],
    ['completed', 'bell_tool_final_answer'],
  ])('does not recover a %s tool response with purpose %s', async (status, purpose) => {
    FakeOpenAiRealtimeWebSocket.afterGreetingEvents = [
      {
        type: 'response.done',
        event_id: 'evt_tool_done',
        response: {
          id: 'resp_tool',
          status,
          metadata: purpose ? { purpose } : undefined,
          output: [
            {
              id: 'item_tool',
              type: 'mcp_call',
              name: 'fetch',
              server_label: 'philip_archive',
              arguments: '{}',
              output: 'result',
            },
          ],
        },
      },
    ]

    const greeting = await startBellLiveGreeting('rtc_call_greeting')

    expect(FakeOpenAiRealtimeWebSocket.sentEvents).toHaveLength(1)
    FakeOpenAiRealtimeWebSocket.sockets[0]?.closeFromServer()
    await greeting.conversation
  })

  it('logs a sanitized provider error that arrives after the greeting', async () => {
    const lifecycle: BellLiveLifecycleEvent[] = []
    const greeting = await startBellLiveGreeting('rtc_call_greeting', {
      onLifecycleEvent: (event) => lifecycle.push(event),
    })

    FakeOpenAiRealtimeWebSocket.sockets[0]?.emitServerEvent({
      type: 'error',
      event_id: 'evt_private_error',
      error: {
        code: 'response_rejected',
        type: 'invalid_request_error',
        message: 'PRIVATE_PROVIDER_MESSAGE',
      },
    })
    FakeOpenAiRealtimeWebSocket.sockets[0]?.closeFromServer()
    await expect(greeting.conversation).resolves.toMatchObject({
      observerCompleted: false,
    })

    expect(lifecycle).toContainEqual({
      event: 'bell_live.observer',
      outcome: 'failed',
      providerCode: 'response_rejected',
      providerType: 'invalid_request_error',
      reason: 'provider_error',
      socketHttpStatus: null,
    })
    expect(JSON.stringify(lifecycle)).not.toContain('PRIVATE_PROVIDER_MESSAGE')
  })

  it('allows normal model and playback latency beyond four seconds', async () => {
    vi.useFakeTimers()
    FakeOpenAiRealtimeWebSocket.greetingEventDelayMs = 5_000

    const pendingGreeting = startBellLiveGreeting('rtc_call_greeting')
    await vi.advanceTimersByTimeAsync(5_000)
    const greeting = await pendingGreeting

    expect(greeting.audioStarted).toBe(true)
    FakeOpenAiRealtimeWebSocket.sockets[0]?.closeFromServer()
    await greeting.conversation
  })

  it('authenticates the Node sideband socket with API and project headers', async () => {
    process.env.OPENAI_BASE_URL = 'https://example.invalid/v1'
    await startBellLiveGreeting('rtc_call_greeting')

    expect(FakeOpenAiRealtimeWebSocket.connections).toEqual([
      {
        url: 'wss://api.openai.com/v1/realtime?call_id=rtc_call_greeting',
        options: {
          headers: {
            Authorization: 'Bearer test-openai-key',
            'OpenAI-Project': 'proj_test123',
          },
        },
      },
    ])
    expect(
      JSON.stringify(FakeOpenAiRealtimeWebSocket.connections)
    ).not.toContain('openai-insecure-api-key')
  })

  it('treats an interrupted completed greeting buffer as finished', async () => {
    FakeOpenAiRealtimeWebSocket.emitAudioCleared = true
    FakeOpenAiRealtimeWebSocket.emitAudioStopped = false

    await expect(
      startBellLiveGreeting('rtc_call_greeting')
    ).resolves.toMatchObject({
      audioStarted: true,
      responseCheckpointed: true,
      responseCreated: true,
    })
  })

  it('keeps observing when the caller interrupts the opening response', async () => {
    FakeOpenAiRealtimeWebSocket.emitAudioCleared = true
    FakeOpenAiRealtimeWebSocket.emitAudioStopped = false
    FakeOpenAiRealtimeWebSocket.finalStatus = 'cancelled'

    const greeting = await startBellLiveGreeting('rtc_call_greeting')
    expect(greeting).toMatchObject({
      audioStarted: true,
      responseCheckpointed: true,
      responseCreated: true,
    })
    expect(FakeOpenAiRealtimeWebSocket.sockets[0]?.closed).toBe(false)

    FakeOpenAiRealtimeWebSocket.sockets[0]?.closeFromServer()
    await expect(greeting.conversation).resolves.toMatchObject({
      observerCompleted: true,
    })
  })

  it('reports only the bounded HTTP status for a failed socket handshake', async () => {
    FakeOpenAiRealtimeWebSocket.handshakeHttpStatus = 401

    await expect(startBellLiveGreeting('rtc_call_greeting')).rejects.toEqual(
      expect.objectContaining({
        name: BellLiveGreetingError.name,
        reason: 'socket_error',
        socketCloseCode: null,
        socketHttpStatus: 401,
      })
    )
  })

  it('retains the sideband until the opening response finishes', async () => {
    FakeOpenAiRealtimeWebSocket.finalStatus = 'failed'

    await expect(startBellLiveGreeting('rtc_call_greeting')).rejects.toEqual(
      expect.objectContaining({
        name: BellLiveGreetingError.name,
        audioStarted: true,
        providerCode: 'greeting_failed',
        providerType: 'server_error',
        reason: 'response_not_completed',
        responseStatus: 'failed',
      })
    )
  })

  it('reports a failed response before SIP audio begins as retryable state', async () => {
    FakeOpenAiRealtimeWebSocket.emitAudioStarted = false
    FakeOpenAiRealtimeWebSocket.emitAudioStopped = false
    FakeOpenAiRealtimeWebSocket.finalStatus = 'failed'

    await expect(startBellLiveGreeting('rtc_call_greeting')).rejects.toEqual(
      expect.objectContaining({
        name: BellLiveGreetingError.name,
        audioStarted: false,
        responseCreated: true,
        responseRequested: true,
      })
    )
  })
})
