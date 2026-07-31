import { sendSimpleEmail } from '@/lib/email/ses'
import {
  renderBellLiveTranscriptEmail,
  renderBellLiveTranscriptText,
  renderIncomingSmsEmail,
  renderIncomingSmsText,
  renderMissedCallEmail,
  renderMissedCallText,
  renderSmsSignupEmail,
  renderSmsSignupText,
} from '@/lib/email/templates/phone'
import {
  type BellLiveTranscriptTurn,
  formatBellLiveTranscript,
} from '@/lib/phone/bell-live-transcript'
import { numberLabel, phoneNotificationRecipients } from '@/lib/phone/config'
import type { TwilioWebhookMetadata } from '@/lib/phone/webhook-metadata'

/** Emails the spoken transcript after a Bell AI SIP conversation ends. */
export async function sendBellLiveTranscriptNotification(input: {
  callSid: string
  durationMs: number
  inputFailureCount: number
  missingTranscriptCount: number
  observerCompleted: boolean
  turns: BellLiveTranscriptTurn[]
}): Promise<void> {
  const partial =
    !input.observerCompleted ||
    input.inputFailureCount > 0 ||
    input.missingTranscriptCount > 0 ||
    input.turns.length === 0 ||
    input.turns.some((turn) => turn.interrupted || !turn.complete)
  const payload = {
    callSid: input.callSid,
    durationSeconds: String(Math.max(0, Math.round(input.durationMs / 1_000))),
    finishedAt: new Date(),
    partial,
    transcript: formatBellLiveTranscript(input.turns),
  }
  await sendSimpleEmail({
    to: phoneNotificationRecipients(),
    subject: 'Bell AI phone conversation transcript',
    html: renderBellLiveTranscriptEmail(payload),
    text: renderBellLiveTranscriptText(payload),
  })
}

/** Emails a heads-up that a call is ringing through to voicemail. */
export async function sendMissedCallNotification(input: {
  from: string
  to: string
  greeting: string
  metadata?: TwilioWebhookMetadata | null
}): Promise<void> {
  const toLabel = numberLabel(input.to)
  const payload = {
    from: input.from,
    to: input.to,
    toLabel,
    greeting: input.greeting,
    metadata: input.metadata ?? null,
    receivedAt: new Date(),
  }
  await sendSimpleEmail({
    to: phoneNotificationRecipients(),
    subject: `Missed call from ${input.from} to ${toLabel}`,
    html: renderMissedCallEmail(payload),
    text: renderMissedCallText(payload),
  })
}

/** Emails an inbound SMS to the notification address. */
export async function sendIncomingSmsNotification(input: {
  from: string
  to: string
  body: string
  bellResponse?: string
  bellReplyFailed?: boolean
  receivedAt?: Date
}): Promise<void> {
  const toLabel = numberLabel(input.to)
  const payload = {
    from: input.from,
    to: input.to,
    toLabel,
    body: input.body,
    bellResponse: input.bellResponse,
    bellReplyFailed: input.bellReplyFailed,
    receivedAt: input.receivedAt ?? new Date(),
  }
  await sendSimpleEmail({
    to: phoneNotificationRecipients(),
    subject: `SMS from ${input.from} to ${toLabel}`,
    html: renderIncomingSmsEmail(payload),
    text: renderIncomingSmsText(payload),
  })
}

/** Emails an admin heads-up when a phone number joins the SMS list. */
export async function sendSmsSignupNotification(input: {
  phoneNumber: string
  to: string
  source: 'sms' | 'voice-menu'
  metadata?: TwilioWebhookMetadata | null
}): Promise<void> {
  const toLabel = numberLabel(input.to)
  const payload = {
    phoneNumber: input.phoneNumber,
    to: input.to,
    toLabel,
    source: input.source,
    metadata: input.metadata ?? null,
    receivedAt: new Date(),
  }
  await sendSimpleEmail({
    to: phoneNotificationRecipients(),
    subject: `SMS signup from ${input.phoneNumber} via ${
      input.source === 'sms' ? 'text' : 'voice menu'
    }`,
    html: renderSmsSignupEmail(payload),
    text: renderSmsSignupText(payload),
  })
}
