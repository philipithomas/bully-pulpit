import { openai } from '@ai-sdk/openai'
import { experimental_transcribe as transcribe } from 'ai'
import { sendEmailWithAttachment } from '@/lib/email/ses'
import {
  renderVoicemailEmail,
  renderVoicemailText,
} from '@/lib/email/templates/phone'
import { numberLabel, phoneNotificationRecipients } from '@/lib/phone/config'

// Voicemail processing. Ported from junk-drawer's ProcessVoicemailJob:
// download the recording from Twilio, transcribe it, and email the
// transcription with the audio attached. Transcription uses the OpenAI
// provider directly (OPENAI_API_KEY) because the AI Gateway routes language,
// embedding, and image models but not audio transcription.

export type VoicemailInput = {
  recordingUrl: string
  recordingSid: string
  from: string
  to: string
  durationSeconds: string
}

/** Audio below this size is a butt-dial or an empty hang-up recording. */
const MIN_AUDIO_BYTES = 1_000

async function downloadRecording(recordingUrl: string): Promise<Uint8Array> {
  // Twilio serves recordings in multiple formats; `.mp3` selects the MP3
  // rendition. fetch follows Twilio's redirect to the media host.
  const response = await fetch(`${recordingUrl}.mp3`)
  if (!response.ok) {
    throw new Error(
      `Failed to download recording: ${response.status} ${response.statusText}`
    )
  }
  return new Uint8Array(await response.arrayBuffer())
}

async function transcribeAudio(audio: Uint8Array): Promise<string | null> {
  try {
    const result = await transcribe({
      model: openai.transcription('gpt-4o-mini-transcribe'),
      audio,
    })
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
  const audio = await downloadRecording(input.recordingUrl)

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
