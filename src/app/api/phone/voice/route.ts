import { after, NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { validatedPhoneWebhookForm } from '@/lib/phone/auth'
import { sitePhoneNumber } from '@/lib/phone/config'
import { generateGreeting } from '@/lib/phone/greeting'
import { sendMissedCallNotification } from '@/lib/phone/notifications'
import {
  twimlResponse,
  voiceMenuTwiml,
  voicemailTwiml,
} from '@/lib/phone/twiml'
import { voicemailCallbackUrls } from '@/lib/phone/voicemail-callbacks'
import { twilioWebhookMetadataFromForm } from '@/lib/phone/webhook-metadata'

/**
 * Twilio voice webhook for incoming calls. Generates a fresh greeting, plays
 * it through the signed AI speech route, and records a voicemail with callbacks
 * into the recording-status and recording-complete routes. The caller, called
 * number, and initial caller metadata ride along on the status callback URL
 * because Twilio's recording callbacks do not include them.
 */
export async function POST(request: Request) {
  const form = await validatedPhoneWebhookForm(request)
  if (!form) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const from = String(form.get('From') ?? 'Unknown')
  const to = String(form.get('To') ?? 'Unknown')
  const metadata = twilioWebhookMetadataFromForm(form, from)

  const greeting = await generateGreeting()

  // Notify after the TwiML response is sent so the caller is not kept waiting
  // on SES (junk-drawer used a background job for the same reason).
  after(async () => {
    try {
      await sendMissedCallNotification({ from, to, greeting, metadata })
    } catch (err) {
      console.error('Failed to send missed call notification:', err)
    }
  })

  const callbackUrls = voicemailCallbackUrls({ from, to, metadata })

  if (!sitePhoneNumber()) {
    return twimlResponse(voicemailTwiml({ greeting, ...callbackUrls }))
  }

  return twimlResponse(
    voiceMenuTwiml({
      greeting,
      menuActionUrl: `${siteConfig.url}/api/phone/voice-menu`,
      ...callbackUrls,
    })
  )
}
