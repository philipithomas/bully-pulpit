import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptBellLiveCall,
  BellLiveGreetingError,
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
  FakeOpenAiRealtimeWebSocket.connections = []
  FakeOpenAiRealtimeWebSocket.emitAudioCleared = false
  FakeOpenAiRealtimeWebSocket.emitAudioStarted = true
  FakeOpenAiRealtimeWebSocket.emitAudioStopped = true
  FakeOpenAiRealtimeWebSocket.finalStatus = 'completed'
  FakeOpenAiRealtimeWebSocket.handshakeHttpStatus = null
  FakeOpenAiRealtimeWebSocket.sentEvents = []
  FakeOpenAiRealtimeWebSocket.throwOnSend = false
  process.env.OPENAI_API_KEY = 'test-openai-key'
  process.env.OPENAI_PROJECT_ID = 'proj_test123'
  process.env.OPENAI_WEBHOOK_SECRET = 'whsec_test-webhook-secret'
  process.env.TWILIO_SECRET = 'test-twilio-secret'
})

afterEach(() => {
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
      max_output_tokens: 512,
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
    expect(session.instructions).toContain('You are Bell')
    expect(session.instructions).toContain(PHONE_BELL_INITIAL_GREETING)
    expect(PHONE_BELL_MAX_CALL_SECONDS).toBe(300)
    expect(session).not.toHaveProperty('service_tier')
    expect(session.audio.input).not.toHaveProperty('transcription')
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
    await expect(
      startBellLiveGreeting('rtc_call_greeting')
    ).resolves.toMatchObject({
      audioStarted: true,
      durationMs: expect.any(Number),
      responseCheckpointed: true,
      responseCreated: true,
    })
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
  })

  it('authenticates the Node sideband socket with API and project headers', async () => {
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
