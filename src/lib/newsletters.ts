import type { SubscriberPreferenceKey } from '@/lib/auth/preferences'
import { siteConfig } from '@/lib/config'
import { NEWSLETTERS, type Newsletter } from '@/lib/content/types'

export const newsletterList: readonly Newsletter[] = NEWSLETTERS

/**
 * Distribution status is separate from content publication. Archived
 * newsletters keep their posts, feeds, search results, and historical database
 * columns, but disappear from subscription surfaces and cannot be delivered.
 */
export const newsletterStatus = {
  contraption: { active: true },
  workshop: { active: true },
  postcard: { active: true },
  tsundoku: { active: false },
} as const satisfies Record<Newsletter, { active: boolean }>

/**
 * Channel-specific delivery presentation stays declarative so a future
 * photography newsletter can opt in without adding slug checks to the send
 * workflow. The cover is attached only when the post actually has one.
 */
export const newsletterDelivery = {
  contraption: { smsMedia: null },
  workshop: { smsMedia: null },
  postcard: { smsMedia: null },
  tsundoku: { smsMedia: 'cover' },
} as const satisfies Record<Newsletter, { smsMedia: 'cover' | null }>

export function newsletterUsesCoverMms(newsletter: Newsletter): boolean {
  return newsletterDelivery[newsletter].smsMedia === 'cover'
}

export const INACTIVE_NEWSLETTER_SEND_ERROR =
  'Skipped: newsletter distribution is inactive'

export type ActiveNewsletter = {
  [Key in Newsletter]: (typeof newsletterStatus)[Key]['active'] extends true
    ? Key
    : never
}[Newsletter]

export function isNewsletterActive(
  newsletter: Newsletter
): newsletter is ActiveNewsletter {
  return newsletterStatus[newsletter].active
}

export function isNewsletterAcceptingSubscriptions(
  newsletter: Newsletter
): newsletter is ActiveNewsletter {
  return isNewsletterActive(newsletter)
}

/** Accepts strings because persisted queue rows predate this registry. */
export function isNewsletterSendingEnabled(newsletter: string): boolean {
  return (
    newsletter in newsletterStatus &&
    newsletterStatus[newsletter as Newsletter].active
  )
}

/** True only for recognized archived slugs, not nullable legacy queue data. */
export function isNewsletterArchived(newsletter: string): boolean {
  return (
    newsletter in newsletterStatus &&
    !newsletterStatus[newsletter as Newsletter].active
  )
}

export const acceptingSubscriptionNewsletters: readonly ActiveNewsletter[] =
  newsletterList.filter(isNewsletterAcceptingSubscriptions)

export const defaultSignupNewsletters: readonly ActiveNewsletter[] =
  acceptingSubscriptionNewsletters

export const newsletterPreferenceKeys = {
  contraption: 'subscribed_contraption',
  workshop: 'subscribed_workshop',
  postcard: 'subscribed_postcard',
} as const satisfies Record<ActiveNewsletter, SubscriberPreferenceKey>

export const newsletterAccentDots: Record<Newsletter, string> = {
  contraption: 'bg-forest',
  workshop: 'bg-walnut',
  postcard: 'bg-indigo',
  tsundoku: 'bg-sun',
}

export function newsletterRows() {
  return acceptingSubscriptionNewsletters.map((newsletter) => ({
    key: newsletterPreferenceKeys[newsletter],
    ...siteConfig.newsletters[newsletter],
  }))
}

export function acceptingNewsletterRows() {
  return newsletterRows()
}
