import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('ai', () => ({
  experimental_transcribe: vi.fn(),
}))
vi.mock('@ai-sdk/openai', () => ({
  openai: { transcription: vi.fn((id: string) => id) },
}))
vi.mock('@/lib/email/ses', () => ({
  sendEmailWithAttachment: vi.fn(async () => undefined),
}))

import { experimental_transcribe as transcribe } from 'ai'
import { sendEmailWithAttachment } from '@/lib/email/ses'
import { processVoicemail } from '@/lib/phone/voicemail'

const mockedTranscribe = vi.mocked(transcribe)
const mockedSend = vi.mocked(sendEmailWithAttachment)

const input = {
  recordingUrl: 'https://api.twilio.com/recordings/RE123',
  recordingSid: 'RE123',
  from: '+15551234567',
  to: '+12123473190',
  durationSeconds: '42',
}

function stubRecording(bytes: number, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array(bytes), { status }))
  )
}

describe('processVoicemail', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'one@example.com, two@example.com'
  })

  afterEach(() => {
    delete process.env.ADMIN_EMAILS
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('downloads the mp3 rendition, transcribes, and emails the admins with attachment', async () => {
    stubRecording(5_000)
    // biome-ignore lint/suspicious/noExplicitAny: partial transcribe result
    mockedTranscribe.mockResolvedValueOnce({ text: 'Call me back.' } as any)

    await expect(processVoicemail(input)).resolves.toBe('sent')

    const fetchMock = vi.mocked(globalThis.fetch)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.twilio.com/recordings/RE123.mp3'
    )
    expect(mockedSend).toHaveBeenCalledTimes(1)
    const sent = mockedSend.mock.calls[0][0]
    expect(sent.to).toEqual(['one@example.com', 'two@example.com'])
    expect(sent.subject).toBe('Voicemail from +15551234567 to NYC (42s)')
    expect(sent.html).toContain('Call me back.')
    expect(sent.text).toContain('Call me back.')
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
    // biome-ignore lint/suspicious/noExplicitAny: partial transcribe result
    mockedTranscribe.mockResolvedValueOnce({ text: 'Call me back.' } as any)

    await expect(processVoicemail(input)).resolves.toBe('sent')

    const sent = mockedSend.mock.calls[0][0]
    expect(sent.to).toEqual(['philip@contraption.co'])
  })

  it('skips tiny recordings without transcribing', async () => {
    stubRecording(100)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(processVoicemail(input)).resolves.toBe('skipped')
    expect(mockedTranscribe).not.toHaveBeenCalled()
    expect(mockedSend).not.toHaveBeenCalled()
    expect(consoleWarn).toHaveBeenCalled()
  })

  it('skips when the transcription is empty', async () => {
    stubRecording(5_000)
    // biome-ignore lint/suspicious/noExplicitAny: partial transcribe result
    mockedTranscribe.mockResolvedValueOnce({ text: '   ' } as any)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(processVoicemail(input)).resolves.toBe('skipped')
    expect(mockedSend).not.toHaveBeenCalled()
    expect(consoleWarn).toHaveBeenCalled()
  })

  it('skips when the audio is rejected as corrupted', async () => {
    stubRecording(5_000)
    mockedTranscribe.mockRejectedValueOnce(
      new Error('The audio file is corrupted')
    )
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(processVoicemail(input)).resolves.toBe('skipped')
    expect(mockedSend).not.toHaveBeenCalled()
    expect(consoleWarn).toHaveBeenCalled()
  })

  it('throws on transient transcription failures so the workflow retries', async () => {
    stubRecording(5_000)
    mockedTranscribe.mockRejectedValueOnce(new Error('rate limit exceeded'))
    await expect(processVoicemail(input)).rejects.toThrow('rate limit exceeded')
    expect(mockedSend).not.toHaveBeenCalled()
  })

  it('throws when the download fails', async () => {
    stubRecording(0, 404)
    await expect(processVoicemail(input)).rejects.toThrow(
      'Failed to download recording: 404'
    )
    expect(mockedTranscribe).not.toHaveBeenCalled()
  })
})
