import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email/ses', () => ({
  sendEmailWithAttachment: vi.fn(async () => undefined),
}))

import { sendEmailWithAttachment } from '@/lib/email/ses'
import {
  MAX_RECORDING_BYTES,
  processVoicemail,
  twilioRecordingMp3Url,
} from '@/lib/phone/voicemail'

const mockedSend = vi.mocked(sendEmailWithAttachment)
const openAiTranscriptionsUrl = 'https://api.openai.com/v1/audio/transcriptions'

const input = {
  recordingUrl: 'https://api.twilio.com/recordings/RE123',
  recordingSid: 'RE123',
  from: '+15551234567',
  to: '+12123473190',
  durationSeconds: '42',
  metadata: {
    callSid: 'CA123',
    callerName: 'Jane Caller',
    fromCity: 'San Francisco',
    fromState: 'CA',
    fromZip: '94105',
  },
}

interface StubFetchOptions {
  recordingStatus?: number
  recordingHeaders?: HeadersInit
  transcription?: {
    status?: number
    statusText?: string
    body?: string
    text?: string
  }
}

function stubRecording(bytes: number, options: StubFetchOptions = {}) {
  const recordingUrl = `${input.recordingUrl}.mp3`
  const fetchMock = vi.fn(
    async (url: string | URL | Request, _init?: RequestInit) => {
      const href = url instanceof Request ? url.url : String(url)
      if (href === recordingUrl) {
        return new Response(new Uint8Array(bytes), {
          status: options.recordingStatus ?? 200,
          headers: options.recordingHeaders,
        })
      }
      if (href === openAiTranscriptionsUrl) {
        const transcription = options.transcription ?? {}
        const status = transcription.status ?? 200
        if (status >= 400) {
          return new Response(transcription.body ?? '', {
            status,
            statusText: transcription.statusText,
          })
        }
        return Response.json({ text: transcription.text ?? 'Call me back.' })
      }
      throw new Error(`Unexpected fetch: ${href}`)
    }
  )
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
  return fetchMock
}

function transcriptionCalls(fetchMock: ReturnType<typeof stubRecording>) {
  return fetchMock.mock.calls.filter(
    ([url]) => String(url) === openAiTranscriptionsUrl
  )
}

describe('processVoicemail', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'one@example.com, two@example.com'
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.PHONE_NUMBER = '+12123473190'
    process.env.TWILIO_SID = 'AC_test'
    process.env.TWILIO_SECRET = 'token_test'
  })

  afterEach(() => {
    delete process.env.ADMIN_EMAILS
    delete process.env.OPENAI_API_KEY
    delete process.env.PHONE_NUMBER
    delete process.env.TWILIO_SID
    delete process.env.TWILIO_SECRET
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('downloads the mp3 rendition, transcribes, and emails the admins with attachment', async () => {
    const fetchMock = stubRecording(5_000)

    await expect(processVoicemail(input)).resolves.toBe('sent')

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://api.twilio.com/recordings/RE123.mp3'),
      expect.objectContaining({
        redirect: 'error',
        headers: {
          Authorization: `Basic ${Buffer.from('AC_test:token_test').toString('base64')}`,
        },
        signal: expect.any(AbortSignal),
      })
    )
    const [, recordingInit] = fetchMock.mock.calls[0]
    expect(recordingInit?.headers).toEqual({
      Authorization: `Basic ${Buffer.from('AC_test:token_test').toString('base64')}`,
    })
    const [transcriptionCall] = transcriptionCalls(fetchMock)
    expect(transcriptionCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer test-openai-key' },
        body: expect.any(FormData),
      })
    )
    expect(mockedSend).toHaveBeenCalledTimes(1)
    const sent = mockedSend.mock.calls[0][0]
    expect(sent.to).toEqual(['one@example.com', 'two@example.com'])
    expect(sent.subject).toBe('Voicemail from +15551234567 to Phone (42s)')
    expect(sent.html).toContain('Call me back.')
    expect(sent.html).toContain('San Francisco, CA')
    expect(sent.html).toContain('Jane Caller')
    expect(sent.html).toContain('94105')
    expect(sent.html).toContain('CA123')
    expect(sent.text).toContain('Call me back.')
    expect(sent.text).toContain('Origin: San Francisco, CA')
    expect(sent.text).toContain('Caller name: Jane Caller')
    expect(sent.text).toContain('ZIP: 94105')
    expect(sent.text).toContain('Call SID: CA123')
    expect(sent.attachment).toEqual(
      expect.objectContaining({
        filename: 'voicemail-RE123.mp3',
        contentType: 'audio/mpeg',
      })
    )
  })

  it('falls back to the static address when the admin allowlist is empty', async () => {
    process.env.ADMIN_EMAILS = ''
    stubRecording(5_000)

    await expect(processVoicemail(input)).resolves.toBe('sent')

    const sent = mockedSend.mock.calls[0][0]
    expect(sent.to).toEqual(['philip@contraption.co'])
  })

  it('skips tiny recordings without transcribing', async () => {
    const fetchMock = stubRecording(100)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(processVoicemail(input)).resolves.toBe('skipped')
    expect(transcriptionCalls(fetchMock)).toEqual([])
    expect(mockedSend).not.toHaveBeenCalled()
    expect(consoleWarn).toHaveBeenCalled()
  })

  it('skips when the transcription is empty', async () => {
    stubRecording(5_000, { transcription: { text: '   ' } })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(processVoicemail(input)).resolves.toBe('skipped')
    expect(mockedSend).not.toHaveBeenCalled()
    expect(consoleWarn).toHaveBeenCalled()
  })

  it('skips when the audio is rejected as corrupted', async () => {
    stubRecording(5_000, {
      transcription: {
        status: 400,
        statusText: 'Bad Request',
        body: 'The audio file is corrupted',
      },
    })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(processVoicemail(input)).resolves.toBe('skipped')
    expect(mockedSend).not.toHaveBeenCalled()
    expect(consoleWarn).toHaveBeenCalled()
  })

  it('throws on transient transcription failures so the workflow retries', async () => {
    stubRecording(5_000, {
      transcription: {
        status: 429,
        statusText: 'Too Many Requests',
        body: 'rate limit exceeded',
      },
    })
    await expect(processVoicemail(input)).rejects.toThrow('rate limit exceeded')
    expect(mockedSend).not.toHaveBeenCalled()
  })

  it('throws when the download fails', async () => {
    const fetchMock = stubRecording(0, { recordingStatus: 404 })
    await expect(processVoicemail(input)).rejects.toThrow(
      'Failed to download recording: 404'
    )
    expect(transcriptionCalls(fetchMock)).toEqual([])
  })

  it('fails closed before fetching when Twilio credentials are missing', async () => {
    delete process.env.TWILIO_SECRET
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(processVoicemail(input)).rejects.toThrow(
      'Missing TWILIO_SID or TWILIO_SECRET'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects non-Twilio, non-HTTPS, credentialed, and SID-mismatched urls', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    for (const recordingUrl of [
      'http://api.twilio.com/recordings/RE123',
      'https://attacker.example/recordings/RE123',
      'https://user:secret@api.twilio.com/recordings/RE123',
      'https://api.twilio.com/recordings/RE999',
      'https://api.twilio.com/recordings/RE123?redirect=attacker',
    ]) {
      await expect(
        processVoicemail({ ...input, recordingUrl })
      ).rejects.toThrow('Invalid Twilio recording URL')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a declared recording above the byte limit', async () => {
    stubRecording(1, {
      recordingHeaders: {
        'content-length': String(MAX_RECORDING_BYTES + 1),
      },
    })
    await expect(processVoicemail(input)).rejects.toThrow(
      'Twilio recording exceeds the maximum size'
    )
    expect(mockedSend).not.toHaveBeenCalled()
  })

  it('rejects an unannounced stream above the byte limit', async () => {
    stubRecording(MAX_RECORDING_BYTES + 1)
    await expect(processVoicemail(input)).rejects.toThrow(
      'Twilio recording exceeds the maximum size'
    )
    expect(mockedSend).not.toHaveBeenCalled()
  })
})

describe('twilioRecordingMp3Url', () => {
  it('accepts the exact Twilio recording resource and adds the rendition', () => {
    expect(
      twilioRecordingMp3Url(
        'https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123',
        'RE123'
      )?.href
    ).toBe(
      'https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123.mp3'
    )
  })
})
