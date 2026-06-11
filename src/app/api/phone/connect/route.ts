import { NextResponse } from 'next/server'
import { isAuthorizedPhoneWebhook } from '@/lib/phone/auth'
import { isE164, isOwnedTwilioNumber } from '@/lib/phone/config'
import { connectCallTwiml, twimlResponse } from '@/lib/phone/twiml'

/**
 * Click-to-call bridge callback. Twilio fetches this once the owner's phone
 * answers; it returns <Dial> instructions that connect the owner to the
 * destination. The destination and caller_id ride along on the URL because
 * Twilio's call callback does not echo the trigger's parameters.
 *
 * Hardening: the shared webhook secret is validated first (fail closed), then
 * both values are re-validated server-side before they reach the TwiML, so a
 * forged or tampered callback URL cannot dial an arbitrary number or spoof a
 * caller_id we do not own. Both values are XML-escaped by connectCallTwiml.
 */
export async function POST(request: Request) {
  if (!isAuthorizedPhoneWebhook(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  const target = params.get('target') ?? ''
  const callerId = params.get('callerId') ?? ''

  if (!isE164(target) || !isOwnedTwilioNumber(callerId)) {
    return NextResponse.json(
      { error: 'Invalid target or caller id' },
      { status: 400 }
    )
  }

  return twimlResponse(connectCallTwiml({ target, callerId }))
}
