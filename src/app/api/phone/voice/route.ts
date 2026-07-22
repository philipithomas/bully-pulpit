import { after, NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { findSmsSubscriberByPhoneNumber } from '@/lib/db/queries/sms-subscribers'
import { validatedPhoneWebhookForm } from '@/lib/phone/auth'
import { isE164, sitePhoneNumber } from '@/lib/phone/config'
import { generateGreeting } from '@/lib/phone/greeting'
import { sendMissedCallNotification } from '@/lib/phone/notifications'
import {
  twimlResponse,
  voiceMenuTwiml,
  voicemailTwiml,
} from '@/lib/phone/twiml'
import { voicemailCallbackUrls } from '@/lib/phone/voicemail-callbacks'
import { twilioWebhookMetadataFromForm } from '@/lib/phone/webhook-metadata'

async function hasConfirmedSmsSubscription(
  phoneNumber: string
): Promise<boolean> {
  if (!isE164(phoneNumber)) return false

  try {
    const subscriber = await findSmsSubscriberByPhoneNumber(phoneNumber)
    return Boolean(subscriber?.confirmedAt)
  } catch (err) {
    console.error('[phone/voice] SMS subscription lookup failed:', err)
    return false
  }
}

/**
 * Twilio voice webhook for incoming calls. Generates a fresh greeting, plays
 * it through the signed AI speech route, and records a voicemail with callbacks
 * into the recording-status and recording-complete routes. The caller, called
 * number, and initial caller metadata ride along on the status callback URL
 * because Twilio's recording callbacks do not include them. Confirmed SMS
 * subscribers bypass the signup menu and proceed directly to voicemail.
 */
export async function POST(request: Request) {
  const form = await validatedPhoneWebhookForm(request)
  if (!form) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const from = String(form.get('From') ?? 'Unknown')
  const to = String(form.get('To') ?? 'Unknown')
  const metadata = twilioWebhookMetadataFromForm(form, from)

  const publicPhoneNumber = sitePhoneNumber()
  const [greeting, alreadySubscribed] = await Promise.all([
    generateGreeting(),
    publicPhoneNumber
      ? hasConfirmedSmsSubscription(from)
      : Promise.resolve(false),
  ])

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

  if (!publicPhoneNumber || alreadySubscribed) {
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
