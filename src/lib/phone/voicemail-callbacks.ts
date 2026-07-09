import { siteConfig } from '@/lib/config'

export function voicemailCallbackUrls(input: { from: string; to: string }): {
  recordingStatusUrl: string
  recordingCompleteUrl: string
} {
  const statusParams = new URLSearchParams({
    caller: input.from,
    called: input.to,
  })

  return {
    recordingStatusUrl: `${siteConfig.url}/api/phone/recording-status?${statusParams}`,
    recordingCompleteUrl: `${siteConfig.url}/api/phone/recording-complete`,
  }
}
