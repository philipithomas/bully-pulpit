import { siteConfig } from '@/lib/config'
import { phoneBellLiveConfigured } from '@/lib/phone/bell-live'
import { sitePhoneNumber } from '@/lib/phone/config'
import { PHONE_IVR_FALLBACK_PROMPTS } from '@/lib/phone/ivr-audio'
import { voiceMenuTwiml, voicemailTwiml } from '@/lib/phone/twiml'
import { voicemailCallbackUrls } from '@/lib/phone/voicemail-callbacks'
import {
  phoneHandoffCallbackUrl,
  twilioWebhookMetadataFromForm,
  twilioWebhookMetadataFromSignedRequest,
} from '@/lib/phone/webhook-metadata'

/** Used only after validating Twilio's signature on the complete form. */
export function phoneKeypadTwiml(
  form: FormData,
  options: { bellUnavailable?: boolean; requestUrl?: string } = {}
): string {
  const from = String(form.get('From') ?? 'Unknown')
  const to = String(form.get('To') ?? 'Unknown')
  const metadata = options.requestUrl
    ? twilioWebhookMetadataFromSignedRequest(form, options.requestUrl, from)
    : twilioWebhookMetadataFromForm(form, from)
  const callbackUrls = voicemailCallbackUrls({ from, to, metadata })
  const bellAvailable = phoneBellLiveConfigured()
  const smsAvailable = Boolean(sitePhoneNumber())
  const greeting = options.bellUnavailable
    ? PHONE_IVR_FALLBACK_PROMPTS.bellUnavailable
    : undefined

  if (!bellAvailable && !smsAvailable) {
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
      ? smsAvailable
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
