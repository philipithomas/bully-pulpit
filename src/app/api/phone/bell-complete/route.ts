import { NextResponse } from 'next/server'
import { validatedPhoneWebhookForm } from '@/lib/phone/auth'
import { PHONE_IVR_FALLBACK_PROMPTS } from '@/lib/phone/ivr-audio'
import {
  playAndHangupTwiml,
  twimlResponse,
  voicemailTwiml,
} from '@/lib/phone/twiml'
import { voicemailCallbackUrls } from '@/lib/phone/voicemail-callbacks'
import { twilioWebhookMetadataFromForm } from '@/lib/phone/webhook-metadata'

/** Handles the synchronous Twilio <Dial> result after a Bell Live SIP leg. */
export async function POST(request: Request): Promise<Response> {
  const form = await validatedPhoneWebhookForm(request)
  if (!form) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (String(form.get('DialCallStatus') ?? '') === 'completed') {
    return twimlResponse(playAndHangupTwiml('goodbye'))
  }

  const from = String(form.get('From') ?? 'Unknown')
  const to = String(form.get('To') ?? 'Unknown')
  const metadata = twilioWebhookMetadataFromForm(form, from)
  return twimlResponse(
    voicemailTwiml({
      greeting: PHONE_IVR_FALLBACK_PROMPTS.bellUnavailable,
      greetingFallback: 'bellUnavailable',
      ...voicemailCallbackUrls({ from, to, metadata }),
    })
  )
}
