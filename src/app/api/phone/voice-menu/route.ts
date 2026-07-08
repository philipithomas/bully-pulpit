import { NextResponse } from 'next/server'
import { subscribeSmsNumber } from '@/lib/db/queries/sms-subscribers'
import { isAuthorizedPhoneWebhook } from '@/lib/phone/auth'
import { isE164, numberLabel } from '@/lib/phone/config'
import {
  sayAndHangupTwiml,
  twimlResponse,
  voicemailTwiml,
} from '@/lib/phone/twiml'
import { voicemailCallbackUrls } from '@/lib/phone/voicemail-callbacks'

/**
 * Handles the DTMF choice from /api/phone/voice. 1 or timeout goes to voicemail;
 * 2 subscribes the caller ID to the all-newsletters SMS list.
 */
export async function POST(request: Request) {
  if (!isAuthorizedPhoneWebhook(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await request.formData()
  const digits = String(form.get('Digits') ?? '')
  const from = String(form.get('From') ?? 'Unknown')
  const to = String(form.get('To') ?? 'Unknown')

  if (digits === '2') {
    if (!isE164(from)) {
      return twimlResponse(
        sayAndHangupTwiml(
          'We could not subscribe this caller ID. Please text SUBSCRIBE to the number you called.'
        )
      )
    }

    await subscribeSmsNumber({
      phoneNumber: from,
      source: `call:${numberLabel(to).toLowerCase()}`,
    })
    return twimlResponse(
      sayAndHangupTwiml(
        'You are subscribed to text message updates from philipithomas.com. Goodbye.'
      )
    )
  }

  return twimlResponse(
    voicemailTwiml({
      greeting: 'Leave a message after the tone.',
      ...voicemailCallbackUrls({ from, to }),
    })
  )
}
