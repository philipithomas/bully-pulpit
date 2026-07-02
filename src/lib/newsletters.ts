import type { SubscriberPreferenceKey } from '@/lib/auth/preferences'
import { siteConfig } from '@/lib/config'
import { NEWSLETTERS, type Newsletter } from '@/lib/content/types'

export const newsletterList: readonly Newsletter[] = NEWSLETTERS

export const defaultSignupNewsletters: readonly Newsletter[] = newsletterList

export const newsletterPreferenceKeys = {
  contraption: 'subscribed_contraption',
  workshop: 'subscribed_workshop',
  postcard: 'subscribed_postcard',
  tsundoku: 'subscribed_tsundoku',
} as const satisfies Record<Newsletter, SubscriberPreferenceKey>

export const newsletterAccentDots: Record<Newsletter, string> = {
  contraption: 'bg-forest',
  workshop: 'bg-walnut',
  postcard: 'bg-indigo',
  tsundoku: 'bg-sun',
}

export function newsletterRows() {
  return newsletterList.map((newsletter) => ({
    key: newsletterPreferenceKeys[newsletter],
    ...siteConfig.newsletters[newsletter],
  }))
}
