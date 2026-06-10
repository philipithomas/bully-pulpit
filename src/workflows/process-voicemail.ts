import { processVoicemail, type VoicemailInput } from '@/lib/phone/voicemail'

// Durable voicemail processing — the Vercel Workflow replacement for
// junk-drawer's Solid Queue ProcessVoicemailJob. Download, transcription, and
// the notification email run as one step because the audio bytes are needed
// end to end (passing megabytes between steps would just serialize them for
// nothing); the step retries as a unit on transient failures (recording not
// yet propagated on Twilio's media host, OpenAI rate limits, SES throttling).
// The email send is at-least-once: a crash between SES accepting the message
// and the step completing can duplicate the notification on retry, which is
// acceptable for a personal voicemail inbox.

async function transcribeAndNotify(
  input: VoicemailInput
): Promise<'sent' | 'skipped'> {
  'use step'
  return processVoicemail(input)
}

transcribeAndNotify.maxRetries = 5

/** Transcribes one completed Twilio recording and emails the result. */
export async function processVoicemailWorkflow(
  input: VoicemailInput
): Promise<'sent' | 'skipped'> {
  'use workflow'
  return transcribeAndNotify(input)
}
