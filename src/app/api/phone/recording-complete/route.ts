import { NextResponse } from 'next/server'
import { validatedPhoneWebhookForm } from '@/lib/phone/auth'
import { goodbyeTwiml, twimlResponse } from '@/lib/phone/twiml'

/** Twilio <Record action> target: thanks the caller and hangs up. */
export async function POST(request: Request) {
  if (!(await validatedPhoneWebhookForm(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return twimlResponse(goodbyeTwiml())
}
