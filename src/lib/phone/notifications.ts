import { sendSimpleEmail } from '@/lib/email/ses'
import {
  renderIncomingSmsEmail,
  renderIncomingSmsText,
  renderMissedCallEmail,
  renderMissedCallText,
} from '@/lib/email/templates/phone'
import { numberLabel, phoneNotificationEmail } from '@/lib/phone/config'

/** Emails a heads-up that a call is ringing through to voicemail. */
export async function sendMissedCallNotification(input: {
  from: string
  to: string
  greeting: string
}): Promise<void> {
  const toLabel = numberLabel(input.to)
  const payload = {
    from: input.from,
    to: input.to,
    toLabel,
    greeting: input.greeting,
    receivedAt: new Date(),
  }
  await sendSimpleEmail({
    to: phoneNotificationEmail(),
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
}): Promise<void> {
  const toLabel = numberLabel(input.to)
  const payload = {
    from: input.from,
    to: input.to,
    toLabel,
    body: input.body,
    receivedAt: new Date(),
  }
  await sendSimpleEmail({
    to: phoneNotificationEmail(),
    subject: `SMS from ${input.from} to ${toLabel}`,
    html: renderIncomingSmsEmail(payload),
    text: renderIncomingSmsText(payload),
  })
}
