import { getStepMetadata } from 'workflow'
import { markPhoneWebhookEventProcessed } from '@/lib/db/queries/phone-webhook-events'
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

export type ProcessVoicemailWorkflowInput = {
  webhookEventId: number
  webhookLease: string
  voicemail: VoicemailInput
}

async function acceptWebhookLease(
  webhookEventId: number,
  webhookLease: string
): Promise<boolean> {
  'use step'
  const processingAt = new Date(webhookLease)
  if (Number.isNaN(processingAt.getTime())) return false
  const { stepId } = getStepMetadata()
  return markPhoneWebhookEventProcessed(webhookEventId, processingAt, stepId)
}

acceptWebhookLease.maxRetries = 5

async function transcribeAndNotify(
  input: VoicemailInput
): Promise<'sent' | 'skipped'> {
  'use step'
  return processVoicemail(input)
}

transcribeAndNotify.maxRetries = 5

/** Transcribes one completed Twilio recording and emails the result. */
export async function processVoicemailWorkflow(
  input: ProcessVoicemailWorkflowInput
): Promise<'sent' | 'skipped' | 'duplicate'> {
  'use workflow'
  // This is the first durable step. If webhook delivery, the route response,
  // or workflow enqueue is ambiguous, only the run holding the exact current
  // database lease can consume it and proceed to external side effects.
  const accepted = await acceptWebhookLease(
    input.webhookEventId,
    input.webhookLease
  )
  if (!accepted) return 'duplicate'
  return transcribeAndNotify(input.voicemail)
}
