import { sendEmailWithAttachment } from '@/lib/email/ses'
import {
  renderVoicemailEmail,
  renderVoicemailText,
} from '@/lib/email/templates/phone'
import { numberLabel, phoneNotificationRecipients } from '@/lib/phone/config'
import { twilioBasicAuthHeader, twilioCredentials } from '@/lib/phone/twilio'
import type { TwilioWebhookMetadata } from '@/lib/phone/webhook-metadata'

// Voicemail processing. Ported from junk-drawer's ProcessVoicemailJob:
// download the recording from Twilio, transcribe it, and email the
// transcription with the audio attached. Transcription currently stays on the
// direct OpenAI API (OPENAI_API_KEY); the IVR speech route uses AI Gateway
// separately.

export type VoicemailInput = {
  recordingUrl: string
  recordingSid: string
  from: string
  to: string
  durationSeconds: string
  metadata?: TwilioWebhookMetadata | null
}

/** Audio below this size is a butt-dial or an empty hang-up recording. */
const MIN_AUDIO_BYTES = 1_000
export const MAX_RECORDING_BYTES = 12 * 1024 * 1024
const RECORDING_DOWNLOAD_TIMEOUT_MS = 10_000
const TWILIO_RECORDING_HOSTS = new Set(['api.twilio.com'])
const OPENAI_TRANSCRIPTIONS_URL =
  'https://api.openai.com/v1/audio/transcriptions'
const OPENAI_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe'

export function twilioRecordingMp3Url(
  recordingUrl: string,
  recordingSid: string
): URL | null {
  if (!/^RE[A-Za-z0-9]{3,64}$/.test(recordingSid)) return null
  let url: URL
  try {
    url = new URL(recordingUrl)
  } catch {
    return null
  }
  if (
    url.protocol !== 'https:' ||
    !TWILIO_RECORDING_HOSTS.has(url.hostname.toLowerCase()) ||
    (url.port !== '' && url.port !== '443') ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    return null
  }
  const finalSegment = url.pathname.split('/').filter(Boolean).at(-1)
  if (finalSegment !== recordingSid) return null
  url.pathname = `${url.pathname}.mp3`
  return url
}

async function boundedResponseBytes(response: Response): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length')
  if (contentLength && /^\d+$/.test(contentLength)) {
    const declared = Number(contentLength)
    if (Number.isSafeInteger(declared) && declared > MAX_RECORDING_BYTES) {
      throw new Error('Twilio recording exceeds the maximum size')
    }
  }
  if (!response.body) throw new Error('Twilio recording response had no body')

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_RECORDING_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new Error('Twilio recording exceeds the maximum size')
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function downloadRecording(input: VoicemailInput): Promise<Uint8Array> {
  const url = twilioRecordingMp3Url(input.recordingUrl, input.recordingSid)
  if (!url) throw new Error('Invalid Twilio recording URL')
  const { accountSid, authToken } = twilioCredentials()

  const response = await fetch(url, {
    redirect: 'error',
    headers: {
      Authorization: twilioBasicAuthHeader(accountSid, authToken),
    },
    signal: AbortSignal.timeout(RECORDING_DOWNLOAD_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(
      `Failed to download recording: ${response.status} ${response.statusText}`
    )
  }
  return boundedResponseBytes(response)
}

async function transcribeAudio(audio: Uint8Array): Promise<string | null> {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set')
    }

    const audioBuffer = new ArrayBuffer(audio.byteLength)
    new Uint8Array(audioBuffer).set(audio)

    const formData = new FormData()
    formData.set('model', OPENAI_TRANSCRIPTION_MODEL)
    formData.set(
      'file',
      new Blob([audioBuffer], { type: 'audio/mpeg' }),
      'voicemail.mp3'
    )

    const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `OpenAI transcription failed: ${response.status} ${response.statusText}${body ? ` ${body}` : ''}`
      )
    }

    const result: unknown = await response.json()
    if (
      typeof result !== 'object' ||
      result === null ||
      !('text' in result) ||
      typeof result.text !== 'string'
    ) {
      throw new Error('OpenAI transcription response did not include text')
    }
    return result.text
  } catch (err) {
    // A recording Twilio produced but OpenAI rejects (corrupted or
    // unsupported) will never transcribe; treat it as empty rather than
    // retrying forever. Everything else (rate limits, outages) propagates so
    // the workflow retries.
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('corrupted') || message.includes('unsupported')) {
      console.warn(`Transcription failed, audio rejected: ${message}`)
      return null
    }
    throw err
  }
}

/**
 * Downloads, transcribes, and emails one voicemail. Returns 'skipped' for
 * empty recordings (no notification is worth sending) and 'sent' otherwise.
 * Throws on transient failures so the calling workflow step can retry.
 */
export async function processVoicemail(
  input: VoicemailInput
): Promise<'sent' | 'skipped'> {
  const toLabel = numberLabel(input.to)
  const audio = await downloadRecording(input)

  if (audio.byteLength < MIN_AUDIO_BYTES) {
    console.warn(
      `Skipping voicemail, audio too small (${audio.byteLength} bytes) from ${input.from}`
    )
    return 'skipped'
  }

  const transcription = (await transcribeAudio(audio))?.trim()
  if (!transcription) {
    console.warn(
      `Skipping voicemail notification, empty transcription (${input.from} to ${toLabel}, ${input.durationSeconds}s)`
    )
    return 'skipped'
  }

  const payload = {
    from: input.from,
    to: input.to,
    toLabel,
    durationSeconds: input.durationSeconds,
    transcription,
    metadata: input.metadata ?? null,
    receivedAt: new Date(),
  }
  await sendEmailWithAttachment({
    to: phoneNotificationRecipients(),
    subject: `Voicemail from ${input.from} to ${toLabel} (${input.durationSeconds}s)`,
    html: renderVoicemailEmail(payload),
    text: renderVoicemailText(payload),
    attachment: {
      filename: `voicemail-${input.recordingSid}.mp3`,
      contentType: 'audio/mpeg',
      content: audio,
    },
  })
  return 'sent'
}
