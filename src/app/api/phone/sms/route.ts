import { after, NextResponse } from 'next/server'
import {
  findOrCreatePhoneWebhookEvent,
  markPhoneWebhookEventProcessed,
} from '@/lib/db/queries/phone-webhook-events'
import {
  findSmsSubscriberByPhoneNumber,
  subscribeSmsNumber,
  unsubscribeSmsNumber,
} from '@/lib/db/queries/sms-subscribers'
import { createTextMessageWithStatus } from '@/lib/db/queries/text-messages'
import { isAuthorizedPhoneWebhook } from '@/lib/phone/auth'
import { numberLabel } from '@/lib/phone/config'
import {
  sendIncomingSmsNotification,
  sendSmsSignupNotification,
} from '@/lib/phone/notifications'
import { smsCommandForBody } from '@/lib/phone/sms-commands'
import {
  SMS_SUBSCRIBE_CONFIRMATION,
  SMS_UNSUBSCRIBE_CONFIRMATION,
} from '@/lib/phone/sms-subscription-copy'
import { emptyTwiml, messageTwiml, twimlResponse } from '@/lib/phone/twiml'
import { twilioWebhookMetadataFromForm } from '@/lib/phone/webhook-metadata'

/**
 * Twilio SMS webhook. Stores the inbound message and ignores duplicate
 * MessageSid redeliveries before applying command side effects.
 */
export async function POST(request: Request) {
  if (!isAuthorizedPhoneWebhook(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await request.formData()
  const from = String(form.get('From') ?? 'Unknown')
  const to = String(form.get('To') ?? 'Unknown')
  const body = String(form.get('Body') ?? '')
  const messageSid = form.get('MessageSid')
    ? String(form.get('MessageSid'))
    : ''
  const optOutType = String(form.get('OptOutType') ?? '')
  const command = smsCommandForBody(body, optOutType)
  const twilioAlreadyReplied =
    optOutType.trim().toUpperCase() === 'START' ||
    optOutType.trim().toUpperCase() === 'STOP'
  const metadata = twilioWebhookMetadataFromForm(form, from)
  const webhookEvent = messageSid
    ? await findOrCreatePhoneWebhookEvent({
        eventKey: `sms:${messageSid}`,
        eventType: 'sms',
      })
    : null
  if (webhookEvent?.event.processedAt) return twimlResponse(emptyTwiml())

  await createTextMessageWithStatus({
    fromNumber: from,
    toNumber: to,
    body,
    direction: 'inbound',
    twilioSid: messageSid || null,
    status: form.get('SmsStatus') ? String(form.get('SmsStatus')) : 'received',
  })

  if (command === 'subscribe') {
    const existing = await findSmsSubscriberByPhoneNumber(from)
    await subscribeSmsNumber({
      phoneNumber: from,
      source: `sms:${numberLabel(to).toLowerCase()}`,
      processedPhoneWebhookEventId: webhookEvent?.event.id,
    })
    if (!existing?.confirmedAt) {
      after(async () => {
        try {
          await sendSmsSignupNotification({
            phoneNumber: from,
            to,
            source: 'sms',
            metadata,
          })
        } catch (err) {
          console.error('[phone/sms] SMS signup notification failed:', err)
        }
      })
    }
    return twimlResponse(
      twilioAlreadyReplied
        ? emptyTwiml()
        : messageTwiml(SMS_SUBSCRIBE_CONFIRMATION)
    )
  }

  if (command === 'unsubscribe') {
    await unsubscribeSmsNumber(from, {
      processedPhoneWebhookEventId: webhookEvent?.event.id,
    })
    return twimlResponse(
      twilioAlreadyReplied
        ? emptyTwiml()
        : messageTwiml(SMS_UNSUBSCRIBE_CONFIRMATION)
    )
  }

  await sendIncomingSmsNotification({ from, to, body })
  if (webhookEvent) {
    await markPhoneWebhookEventProcessed(webhookEvent.event.id)
  }

  return twimlResponse(emptyTwiml())
}
