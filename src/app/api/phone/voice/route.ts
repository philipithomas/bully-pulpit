import { after, NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { validatedPhoneWebhookForm } from '@/lib/phone/auth'
import { bellLiveSipUri } from '@/lib/phone/bell-live'
import { callerSubscriptionStatus } from '@/lib/phone/caller-subscription'
import { sitePhoneNumber } from '@/lib/phone/config'
import { generateGreeting } from '@/lib/phone/greeting'
import { sendMissedCallNotification } from '@/lib/phone/notifications'
import {
  bellLiveTwiml,
  twimlResponse,
  voiceMenuTwiml,
  voicemailTwiml,
} from '@/lib/phone/twiml'
import { voicemailCallbackUrls } from '@/lib/phone/voicemail-callbacks'
import {
  phoneHandoffCallbackUrl,
  twilioWebhookMetadataFromForm,
} from '@/lib/phone/webhook-metadata'

/**
 * Connects configured calls directly to Bell, which speaks its own short
 * greeting. The existing keypad/voicemail entry remains available if Bell
 * cannot be configured for this call.
 */
export async function POST(request: Request) {
  const form = await validatedPhoneWebhookForm(request)
  if (!form) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const from = String(form.get('From') ?? 'Unknown')
  const to = String(form.get('To') ?? 'Unknown')
  const metadata = twilioWebhookMetadataFromForm(form, from)
  const sipUri = bellLiveSipUri(
    String(form.get('CallSid') ?? ''),
    new Date(),
    metadata
  )

  if (sipUri) {
    after(async () => {
      try {
        await sendMissedCallNotification({
          from,
          to,
          metadata,
        })
      } catch (err) {
        console.error('Failed to send missed call notification:', err)
      }
    })

    return twimlResponse(
      bellLiveTwiml({
        sipUri,
        actionUrl: phoneHandoffCallbackUrl(
          `${siteConfig.url}/api/phone/bell-complete`,
          metadata
        ),
      })
    )
  }

  const publicPhoneNumber = sitePhoneNumber()
  const [greeting, subscriptionStatus] = await Promise.all([
    generateGreeting(),
    publicPhoneNumber
      ? callerSubscriptionStatus(from)
      : Promise.resolve('unknown'),
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
  if (!publicPhoneNumber || subscriptionStatus === 'subscribed') {
    return twimlResponse(voicemailTwiml({ greeting, ...callbackUrls }))
  }

  return twimlResponse(
    voiceMenuTwiml({
      greeting,
      menuPrompt: 'menu',
      menuActionUrl: phoneHandoffCallbackUrl(
        `${siteConfig.url}/api/phone/voice-menu`,
        metadata
      ),
      ...callbackUrls,
    })
  )
}
