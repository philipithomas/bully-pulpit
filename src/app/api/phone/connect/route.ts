import { NextResponse } from 'next/server'
import { isAuthorizedPhoneWebhook } from '@/lib/phone/auth'
import { isE164, requireSitePhoneNumber } from '@/lib/phone/config'
import { connectCallTwiml, twimlResponse } from '@/lib/phone/twiml'

/**
 * Click-to-call bridge callback. Twilio fetches this once the owner's phone
 * answers; it returns <Dial> instructions that connect the owner to the
 * destination. The destination rides along on the URL because Twilio's call
 * callback does not echo the trigger's parameters.
 *
 * Hardening: the shared webhook secret is validated first (fail closed), then
 * the target is re-validated server-side before it reaches the TwiML, and the
 * caller id comes from server config. Values are XML-escaped by
 * connectCallTwiml.
 */
export async function POST(request: Request) {
  if (!isAuthorizedPhoneWebhook(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  const target = params.get('target') ?? ''

  if (!isE164(target)) {
    return NextResponse.json({ error: 'Invalid target' }, { status: 400 })
  }

  let callerId: string
  try {
    callerId = requireSitePhoneNumber()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }

  return twimlResponse(connectCallTwiml({ target, callerId }))
}
