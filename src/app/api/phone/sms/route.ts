import { NextResponse } from 'next/server'
import {
  findSmsSubscriberByPhoneNumber,
  subscribeSmsNumber,
  unsubscribeSmsNumber,
} from '@/lib/db/queries/sms-subscribers'
import { createTextMessage } from '@/lib/db/queries/text-messages'
import { isAuthorizedPhoneWebhook } from '@/lib/phone/auth'
import { numberLabel } from '@/lib/phone/config'
import {
  sendIncomingSmsNotification,
  sendSmsSignupNotification,
} from '@/lib/phone/notifications'
import { smsCommandForBody } from '@/lib/phone/sms-commands'
import { emptyTwiml, messageTwiml, twimlResponse } from '@/lib/phone/twiml'
import { twilioWebhookMetadataFromForm } from '@/lib/phone/webhook-metadata'

/**
 * Twilio SMS webhook. Stores the inbound message (deduplicated by MessageSid,
 * so a webhook retry cannot double-insert), forwards it by email, and sends
 * no reply. Both effects run synchronously so a failure surfaces as a webhook
 * error in the Twilio console instead of disappearing.
 */
export async function POST(request: Request) {
  if (!isAuthorizedPhoneWebhook(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await request.formData()
  const from = String(form.get('From') ?? 'Unknown')
  const to = String(form.get('To') ?? 'Unknown')
  const body = String(form.get('Body') ?? '')
  const command = smsCommandForBody(body)
  const metadata = twilioWebhookMetadataFromForm(form, from)

  await createTextMessage({
    fromNumber: from,
    toNumber: to,
    body,
    direction: 'inbound',
    twilioSid: form.get('MessageSid') ? String(form.get('MessageSid')) : null,
    status: form.get('SmsStatus') ? String(form.get('SmsStatus')) : 'received',
  })

  if (command === 'subscribe') {
    const existing = await findSmsSubscriberByPhoneNumber(from)
    await subscribeSmsNumber({
      phoneNumber: from,
      source: `sms:${numberLabel(to).toLowerCase()}`,
    })
    if (!existing?.confirmedAt) {
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
    }
    return twimlResponse(
      messageTwiml(
        'You are subscribed to new posts from philipithomas.com. Reply STOP to unsubscribe.'
      )
    )
  }

  if (command === 'unsubscribe') {
    await unsubscribeSmsNumber(from)
    return twimlResponse(messageTwiml('You are unsubscribed from SMS updates.'))
  }

  await sendIncomingSmsNotification({ from, to, body })

  return twimlResponse(emptyTwiml())
}
