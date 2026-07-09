import { siteConfig } from '@/lib/config'
import { twilioSecret } from '@/lib/phone/config'

export function voicemailCallbackUrls(input: { from: string; to: string }): {
  recordingStatusUrl: string
  recordingCompleteUrl: string
} {
  const secret = twilioSecret() ?? ''
  const statusParams = new URLSearchParams({
    secret,
    caller: input.from,
    called: input.to,
  })
  const completeParams = new URLSearchParams({ secret })

  return {
    recordingStatusUrl: `${siteConfig.url}/api/phone/recording-status?${statusParams}`,
    recordingCompleteUrl: `${siteConfig.url}/api/phone/recording-complete?${completeParams}`,
  }
}
