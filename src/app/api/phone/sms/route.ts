import { NextResponse } from 'next/server'
import { isAuthorizedPhoneWebhook } from '@/lib/phone/auth'
import { sendIncomingSmsNotification } from '@/lib/phone/notifications'
import { emptyTwiml, twimlResponse } from '@/lib/phone/twiml'

/**
 * Twilio SMS webhook. Forwards the message by email and sends no reply. The
 * notification is sent synchronously so a failure surfaces as a webhook error
 * in the Twilio console instead of disappearing.
 */
export async function POST(request: Request) {
  if (!isAuthorizedPhoneWebhook(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await request.formData()
  await sendIncomingSmsNotification({
    from: String(form.get('From') ?? 'Unknown'),
    to: String(form.get('To') ?? 'Unknown'),
    body: String(form.get('Body') ?? ''),
  })

  return twimlResponse(emptyTwiml())
}
