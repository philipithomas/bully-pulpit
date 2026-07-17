import { describe, expect, it } from 'vitest'
import { NEWSLETTERS } from '@/lib/content/types'
import {
  acceptingNewsletterRows,
  acceptingSubscriptionNewsletters,
  defaultSignupNewsletters,
  isNewsletterAcceptingSubscriptions,
  isNewsletterSendingEnabled,
  isPhotoNewsletter,
  newsletterContent,
  newsletterDelivery,
  newsletterList,
  newsletterPreferenceKeys,
  newsletterRows,
  newsletterStatus,
  newsletterUsesCoverMms,
} from '@/lib/newsletters'

describe('newsletter metadata', () => {
  it('keeps the content registry while exposing only active preference rows', () => {
    expect(newsletterList).toEqual([...NEWSLETTERS])
    expect(newsletterRows().map((row) => row.slug)).toEqual(
      acceptingSubscriptionNewsletters
    )
    expect(newsletterRows().map((row) => row.key)).toEqual(
      acceptingSubscriptionNewsletters.map(
        (newsletter) => newsletterPreferenceKeys[newsletter]
      )
    )
  })

  it('defaults new public signups to newsletters accepting subscriptions', () => {
    expect(acceptingSubscriptionNewsletters).toEqual([
      'contraption',
      'workshop',
      'postcard',
      'umami',
    ])
    expect(defaultSignupNewsletters).toEqual(acceptingSubscriptionNewsletters)
    expect(acceptingNewsletterRows().map((row) => row.slug)).toEqual(
      acceptingSubscriptionNewsletters
    )
    expect(isNewsletterAcceptingSubscriptions('tsundoku')).toBe(false)
    expect(isNewsletterAcceptingSubscriptions('umami')).toBe(true)
    expect(isNewsletterSendingEnabled('umami')).toBe(true)
    expect(newsletterStatus.umami).toEqual({ active: true })
    expect(newsletterPreferenceKeys.umami).toBe('subscribed_umami')
    expect(isNewsletterSendingEnabled('tsundoku')).toBe(false)
    expect(newsletterStatus.tsundoku).toEqual({ active: false })
  })

  it('keeps cover MMS a newsletter capability instead of a slug check', () => {
    expect(newsletterDelivery.tsundoku).toEqual({ smsMedia: 'cover' })
    expect(newsletterDelivery.umami).toEqual({ smsMedia: 'cover' })
    expect(newsletterUsesCoverMms('umami')).toBe(true)
    expect(newsletterUsesCoverMms('tsundoku')).toBe(true)
    expect(newsletterUsesCoverMms('contraption')).toBe(false)
  })

  it('classifies photo newsletters independently from delivery settings', () => {
    expect(newsletterContent.tsundoku).toEqual({ photo: true })
    expect(newsletterContent.umami).toEqual({ photo: true })
    expect(isPhotoNewsletter('umami')).toBe(true)
    expect(isPhotoNewsletter('tsundoku')).toBe(true)
    expect(isPhotoNewsletter('contraption')).toBe(false)
  })
})
