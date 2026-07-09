import { siteConfig } from '@/lib/config'
import {
  appendTwilioWebhookMetadata,
  type TwilioWebhookMetadata,
} from '@/lib/phone/webhook-metadata'

export function voicemailCallbackUrls(input: {
  from: string
  to: string
  metadata?: TwilioWebhookMetadata | null
}): {
  recordingStatusUrl: string
  recordingCompleteUrl: string
} {
  const statusParams = new URLSearchParams({
    caller: input.from,
    called: input.to,
  })
  appendTwilioWebhookMetadata(statusParams, input.metadata)

  return {
    recordingStatusUrl: `${siteConfig.url}/api/phone/recording-status?${statusParams}`,
    recordingCompleteUrl: `${siteConfig.url}/api/phone/recording-complete`,
  }
}
