import { siteConfig } from '@/lib/config'
import { NEWSLETTERS, type Newsletter } from '@/lib/content/types'

export const newsletterList: readonly Newsletter[] = NEWSLETTERS

export const defaultSignupNewsletters: readonly Newsletter[] = [
  'contraption',
  'workshop',
  'postcard',
]

export const newsletterPreferenceKeys: Record<Newsletter, string> = {
  contraption: 'subscribed_contraption',
  workshop: 'subscribed_workshop',
  postcard: 'subscribed_postcard',
  tsundoku: 'subscribed_tsundoku',
}

export const newsletterAccentDots: Record<Newsletter, string> = {
  contraption: 'bg-forest',
  workshop: 'bg-walnut',
  postcard: 'bg-indigo',
  tsundoku: 'bg-rising-sun',
}

export function newsletterRows() {
  return newsletterList.map((newsletter) => ({
    key: newsletterPreferenceKeys[newsletter],
    ...siteConfig.newsletters[newsletter],
  }))
}
