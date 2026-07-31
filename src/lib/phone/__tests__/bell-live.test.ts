import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptBellLiveCall,
  bellLiveSipUri,
  PHONE_BELL_MAX_CALL_SECONDS,
  PHONE_BELL_REALTIME_DEFAULT_MODEL_ID,
  PHONE_BELL_REALTIME_MINI_MODEL_ID,
  PHONE_BELL_TRANSCRIPTION_MODEL_ID,
  phoneBellLiveConfigured,
  phoneBellRealtimeSession,
  rejectBellLiveCall,
  verifyBellLiveSipInvitation,
} from '@/lib/phone/bell-live'

const NOW = new Date('2026-07-31T12:00:00Z')
const CALL_SID = 'CA1234567890abcdef1234567890abcdef'

function headersFromSipUri(uri: string) {
  const query = new URLSearchParams(uri.slice(uri.indexOf('?') + 1))
  return Array.from(query, ([name, value]) => ({ name, value }))
}

beforeEach(() => {
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
  it('uses full Realtime at low reasoning with live transcription and read-only archive MCP', () => {
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
          transcription: {
            model: PHONE_BELL_TRANSCRIPTION_MODEL_ID,
            language: 'en',
          },
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
    expect(session.instructions).toContain('Bell AI')
    expect(PHONE_BELL_MAX_CALL_SECONDS).toBe(300)
    expect(session).not.toHaveProperty('service_tier')
  })

  it('accepts and rejects calls through the direct OpenAI call API', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await acceptBellLiveCall('rtc_call_123')
    await rejectBellLiveCall('rtc_call_456')

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.openai.com/v1/realtime/calls/rtc_call_123/accept',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-openai-key',
          'Content-Type': 'application/json',
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
    await expect(acceptBellLiveCall('rtc_call_retry')).resolves.toBeUndefined()
  })
})
