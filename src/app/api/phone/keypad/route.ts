import { NextResponse } from 'next/server'
import { validatedPhoneWebhookForm } from '@/lib/phone/auth'
import { phoneKeypadTwiml } from '@/lib/phone/keypad'
import { twimlResponse } from '@/lib/phone/twiml'

/** Opens the manual choices when Bell transfers the caller to the keypad. */
export async function POST(request: Request): Promise<Response> {
  const form = await validatedPhoneWebhookForm(request)
  if (!form) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return twimlResponse(phoneKeypadTwiml(form))
}
