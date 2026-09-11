import { siteConfig } from '@/lib/config'
import { findPhoneWebhookEventByKey } from '@/lib/db/queries/phone-webhook-events'
import { phoneBellLiveConfigured } from '@/lib/phone/bell-live'
import { callerSubscriptionStatus } from '@/lib/phone/caller-subscription'
import { sitePhoneNumber } from '@/lib/phone/config'
import { PHONE_IVR_FALLBACK_PROMPTS } from '@/lib/phone/ivr-audio'
import { isTwilioCallSid } from '@/lib/phone/twilio'
import { voiceMenuTwiml, voicemailTwiml } from '@/lib/phone/twiml'
import { voicemailCallbackUrls } from '@/lib/phone/voicemail-callbacks'
import {
  phoneHandoffCallbackUrl,
  twilioWebhookMetadataFromForm,
  twilioWebhookMetadataFromSignedRequest,
} from '@/lib/phone/webhook-metadata'

/** Used only after validating Twilio's signature on the complete form. */
export async function phoneKeypadTwiml(
  form: FormData,
  options: { bellUnavailable?: boolean; requestUrl?: string } = {}
): Promise<string> {
  const from = String(form.get('From') ?? 'Unknown')
  const to = String(form.get('To') ?? 'Unknown')
  const metadata = options.requestUrl
    ? twilioWebhookMetadataFromSignedRequest(form, options.requestUrl, from)
    : twilioWebhookMetadataFromForm(form, from)
  const callbackUrls = voicemailCallbackUrls({ from, to, metadata })
  const bellAvailable = phoneBellLiveConfigured()
  const smsAvailable = Boolean(sitePhoneNumber())
  const subscriptionStatus = smsAvailable
    ? await callerSubscriptionStatus(from)
    : 'unknown'
  const callSid = String(form.get('CallSid') ?? '')
  const pendingSignup =
    smsAvailable &&
    subscriptionStatus === 'subscribed' &&
    isTwilioCallSid(callSid)
      ? await findPhoneWebhookEventByKey(`voice-menu:${callSid}:2`).catch(
          () => {
            // A recovery lookup outage must not remove voicemail/keypad access.
            console.warn('[phone/keypad] Signup recovery lookup unavailable')
            return null
          }
        )
      : null
  const resumingSignup =
    pendingSignup?.eventType === 'voice-menu' && !pendingSignup.processedAt
  const offerSignup =
    smsAvailable && (subscriptionStatus !== 'subscribed' || resumingSignup)
  const greeting = options.bellUnavailable
    ? PHONE_IVR_FALLBACK_PROMPTS.bellUnavailable
    : undefined

  if (!bellAvailable && !offerSignup) {
    return voicemailTwiml({
      greeting,
      greetingFallback: 'bellUnavailable',
      ...callbackUrls,
    })
  }

  return voiceMenuTwiml({
    greeting,
    greetingFallback: 'bellUnavailable',
    menuPrompt: bellAvailable
      ? offerSignup
        ? 'menuWithBell'
        : 'bellMenu'
      : 'menu',
    menuActionUrl: phoneHandoffCallbackUrl(
      `${siteConfig.url}/api/phone/voice-menu`,
      metadata
    ),
    ...callbackUrls,
  })
}
