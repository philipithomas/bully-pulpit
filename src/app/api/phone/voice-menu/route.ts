import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { validatedPhoneWebhookForm } from '@/lib/phone/auth'
import { bellLiveSipUri } from '@/lib/phone/bell-live'
import { sitePhoneNumber } from '@/lib/phone/config'
import {
  bellLiveTwiml,
  playAndHangupTwiml,
  twimlResponse,
  voicemailTwiml,
} from '@/lib/phone/twiml'
import { subscribeVoiceCaller } from '@/lib/phone/voice-subscription'
import { voicemailCallbackUrls } from '@/lib/phone/voicemail-callbacks'
import { twilioWebhookMetadataFromForm } from '@/lib/phone/webhook-metadata'

/**
 * Handles the DTMF choice from /api/phone/voice. 1 or timeout goes to voicemail;
 * 2 subscribes a caller ID to the all-newsletters SMS list; 3 transfers the
 * caller to Bell AI over OpenAI Realtime SIP.
 */
export async function POST(request: Request) {
  const form = await validatedPhoneWebhookForm(request)
  if (!form) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const digits = String(form.get('Digits') ?? '')
  const from = String(form.get('From') ?? 'Unknown')
  const to = String(form.get('To') ?? 'Unknown')
  const callSid = form.get('CallSid') ? String(form.get('CallSid')) : ''
  const metadata = twilioWebhookMetadataFromForm(form, from)
  const confirmationFrom = sitePhoneNumber()

  if (digits === '3') {
    const sipUri = bellLiveSipUri(callSid)
    if (sipUri) {
      return twimlResponse(
        bellLiveTwiml({
          sipUri,
          actionUrl: `${siteConfig.url}/api/phone/bell-complete`,
        })
      )
    }
  }

  if (digits === '2' && confirmationFrom) {
    const result = await subscribeVoiceCaller({ from, to, callSid, metadata })
    if (result === 'unavailable') {
      return twimlResponse(playAndHangupTwiml('subscribeFailed'))
    }
    if (result === 'already_handled') {
      return twimlResponse(playAndHangupTwiml('alreadyHandled'))
    }
    return twimlResponse(playAndHangupTwiml('subscribed'))
  }

  return twimlResponse(
    voicemailTwiml({
      ...voicemailCallbackUrls({ from, to, metadata }),
    })
  )
}
