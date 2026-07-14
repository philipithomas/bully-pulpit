import { sendSimpleEmail } from '@/lib/email/ses'
import {
  renderIncomingSmsEmail,
  renderIncomingSmsText,
  renderMissedCallEmail,
  renderMissedCallText,
  renderSmsSignupEmail,
  renderSmsSignupText,
} from '@/lib/email/templates/phone'
import { numberLabel, phoneNotificationRecipients } from '@/lib/phone/config'
import type { TwilioWebhookMetadata } from '@/lib/phone/webhook-metadata'

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
