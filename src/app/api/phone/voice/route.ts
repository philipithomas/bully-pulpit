import { after, NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { isAuthorizedPhoneWebhook } from '@/lib/phone/auth'
import { phoneWebhookSecret } from '@/lib/phone/config'
import { generateGreeting } from '@/lib/phone/greeting'
import { sendMissedCallNotification } from '@/lib/phone/notifications'
import { twimlResponse, voiceMenuTwiml } from '@/lib/phone/twiml'
import { voicemailCallbackUrls } from '@/lib/phone/voicemail-callbacks'

/**
 * Twilio voice webhook for incoming calls. Generates a fresh greeting, speaks
 * it with <Say>, and records a voicemail with callbacks into the
 * recording-status and recording-complete routes. The caller and called
 * numbers ride along on the status callback URL because Twilio's recording
 * callbacks do not include them.
 */
export async function POST(request: Request) {
  if (!isAuthorizedPhoneWebhook(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await request.formData()
  const from = String(form.get('From') ?? 'Unknown')
  const to = String(form.get('To') ?? 'Unknown')

  const greeting = await generateGreeting()

  // Notify after the TwiML response is sent so the caller is not kept waiting
  // on SES (junk-drawer used a background job for the same reason).
  after(async () => {
    try {
      await sendMissedCallNotification({ from, to, greeting })
    } catch (err) {
      console.error('Failed to send missed call notification:', err)
    }
  })

  const secret = phoneWebhookSecret() ?? ''
  const menuParams = new URLSearchParams({ secret })
  const callbackUrls = voicemailCallbackUrls({ from, to })

  return twimlResponse(
    voiceMenuTwiml({
      greeting,
      menuActionUrl: `${siteConfig.url}/api/phone/voice-menu?${menuParams}`,
      ...callbackUrls,
    })
  )
}
