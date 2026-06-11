import { NextResponse } from 'next/server'
import { createTextMessage } from '@/lib/db/queries/text-messages'
import { isAuthorizedPhoneWebhook } from '@/lib/phone/auth'
import { sendIncomingSmsNotification } from '@/lib/phone/notifications'
import { emptyTwiml, twimlResponse } from '@/lib/phone/twiml'

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

  await createTextMessage({
    fromNumber: from,
    toNumber: to,
    body,
    direction: 'inbound',
    twilioSid: form.get('MessageSid') ? String(form.get('MessageSid')) : null,
    status: form.get('SmsStatus') ? String(form.get('SmsStatus')) : 'received',
  })

  await sendIncomingSmsNotification({ from, to, body })

  return twimlResponse(emptyTwiml())
}
