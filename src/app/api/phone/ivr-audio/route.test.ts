import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  speechModel: { provider: 'gateway', modelId: 'openai/tts-1' },
  speechModelFactory: vi.fn(),
}))

vi.mock('ai', () => ({
  generateSpeech: vi.fn(),
}))
vi.mock('@ai-sdk/gateway', () => ({
  gateway: {
    speechModel: mocks.speechModelFactory.mockReturnValue(mocks.speechModel),
  },
}))

import { generateSpeech } from 'ai'
import { GET } from '@/app/api/phone/ivr-audio/route'
import {
  PHONE_IVR_FALLBACK_PROMPTS,
  PHONE_IVR_SPEECH_MODEL_ID,
  PHONE_IVR_SPEECH_VOICE,
  phoneIvrAudioUrl,
  phoneIvrFallbackAudioPath,
  verifyPhoneIvrAudioToken,
} from '@/lib/phone/ivr-audio'

const mockedGenerateSpeech = vi.mocked(generateSpeech)
const AUDIO_BYTES = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69])
const FALLBACK_BYTES = new Uint8Array([
  82, 73, 70, 70, 1, 0, 0, 0, 87, 65, 86, 69,
])
const DYNAMIC_GREETING = `Good morning from NYC. ${PHONE_IVR_FALLBACK_PROMPTS.greeting}`

function validAudioUrl(text = DYNAMIC_GREETING): string {
  return phoneIvrAudioUrl(text, 'greeting')
}

beforeEach(() => {
  process.env.TWILIO_SECRET = 'test-twilio-auth-token'
  mockedGenerateSpeech.mockResolvedValue({
    audio: {
      uint8Array: AUDIO_BYTES,
      mediaType: 'audio/wav',
      format: 'wav',
      base64: Buffer.from(AUDIO_BYTES).toString('base64'),
    },
    warnings: [],
    responses: [],
    providerMetadata: {},
    // biome-ignore lint/suspicious/noExplicitAny: partial speech result fixture
  } as any)
})

afterEach(() => {
  delete process.env.TWILIO_SECRET
  mockedGenerateSpeech.mockReset()
  vi.restoreAllMocks()
})

describe('GET /api/phone/ivr-audio', () => {
  it('generates cacheable Sage WAV audio through AI Gateway', async () => {
    const response = await GET(new Request(validAudioUrl()))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('audio/wav')
    expect(response.headers.get('Content-Length')).toBe(
      String(AUDIO_BYTES.byteLength)
    )
    expect(response.headers.get('Cache-Control')).toContain('max-age=31536000')
    expect(response.headers.get('ETag')).toMatch(/^W\/["]/)
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(AUDIO_BYTES)

    expect(mocks.speechModelFactory).toHaveBeenCalledWith(
      PHONE_IVR_SPEECH_MODEL_ID
    )
    const call = mockedGenerateSpeech.mock.calls[0][0]
    expect(call.model).toBe(mocks.speechModel)
    expect(call.text).toBe(DYNAMIC_GREETING)
    expect(call.voice).toBe(PHONE_IVR_SPEECH_VOICE)
    expect(call.outputFormat).toBe('wav')
    expect(call.abortSignal).toBeInstanceOf(AbortSignal)
    expect(call.maxRetries).toBe(1)
    expect(call).not.toHaveProperty('instructions')
    expect(call).not.toHaveProperty('speed')
  })

  it('serves a committed Gateway-generated WAV for fixed prompts', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(FALLBACK_BYTES, { status: 200 }))
    const url = phoneIvrAudioUrl(
      PHONE_IVR_FALLBACK_PROMPTS.voicemail,
      'voicemail'
    )

    const response = await GET(new Request(url))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('max-age=31536000')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(FALLBACK_BYTES)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(mockedGenerateSpeech).not.toHaveBeenCalled()
  })

  it('rejects tampered and cache-busted tokens without spending a model call', async () => {
    const valid = new URL(validAudioUrl())
    const token = valid.searchParams.get('token') ?? ''
    valid.searchParams.set(
      'token',
      `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`
    )

    const tampered = await GET(new Request(valid))
    expect(tampered.status).toBe(401)
    expect(tampered.headers.get('Cache-Control')).toBe('private, no-store')

    const cacheBusted = new URL(validAudioUrl())
    cacheBusted.searchParams.set('extra', '1')
    expect(await GET(new Request(cacheBusted))).toMatchObject({ status: 401 })
    expect(mockedGenerateSpeech).not.toHaveBeenCalled()
  })

  it('serves a conditional cache hit without another model call', async () => {
    const url = new URL(validAudioUrl())
    const verified = verifyPhoneIvrAudioToken(url.searchParams.get('token'))
    expect(verified).not.toBeNull()

    const response = await GET(
      new Request(url, {
        headers: { 'If-None-Match': verified?.etag ?? '' },
      })
    )

    expect(response.status).toBe(304)
    expect(response.headers.get('ETag')).toBe(verified?.etag)
    expect(mockedGenerateSpeech).not.toHaveBeenCalled()
  })

  it('serves the static Sage WAV when speech generation fails', async () => {
    mockedGenerateSpeech.mockRejectedValueOnce(new Error('gateway unavailable'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(FALLBACK_BYTES, { status: 200 }))

    const response = await GET(new Request(validAudioUrl()))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('audio/wav')
    expect(response.headers.get('Cache-Control')).toContain('max-age=60')
    expect(response.headers.get('ETag')).toContain('-fallback')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(FALLBACK_BYTES)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe(
      phoneIvrFallbackAudioPath('greeting')
    )
    expect(consoleError).toHaveBeenCalledOnce()
  })

  it('fails closed when both live and static speech are unavailable', async () => {
    mockedGenerateSpeech.mockRejectedValueOnce(new Error('gateway unavailable'))
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 404 })
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET(new Request(validAudioUrl()))

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({
      error: 'Speech generation unavailable',
    })
    expect(consoleError).toHaveBeenCalledTimes(2)
  })

  it('does not relabel a corrupt static fallback as WAV audio', async () => {
    mockedGenerateSpeech.mockRejectedValueOnce(new Error('gateway unavailable'))
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<html>not audio</html>', { status: 200 })
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET(new Request(validAudioUrl()))

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(consoleError).toHaveBeenCalledTimes(2)
  })
})
