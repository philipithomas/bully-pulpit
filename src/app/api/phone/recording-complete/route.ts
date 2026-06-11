import { NextResponse } from 'next/server'
import { isAuthorizedPhoneWebhook } from '@/lib/phone/auth'
import { goodbyeTwiml, twimlResponse } from '@/lib/phone/twiml'

/** Twilio <Record action> target: thanks the caller and hangs up. */
export async function POST(request: Request) {
  if (!isAuthorizedPhoneWebhook(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return twimlResponse(goodbyeTwiml())
}
