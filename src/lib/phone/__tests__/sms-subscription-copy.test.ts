import { describe, expect, it } from 'vitest'
import {
  SMS_BELL_CONTACT_FALLBACK,
  SMS_BELL_CONTACT_ONBOARDING,
  SMS_HELP_RESPONSE,
  SMS_SUBSCRIBE_CONFIRMATION,
  SMS_UNSUBSCRIBE_CONFIRMATION,
} from '@/lib/phone/sms-subscription-copy'

describe('SMS subscription copy', () => {
  it('includes the required subscription disclosures', () => {
    expect(SMS_SUBSCRIBE_CONFIRMATION).toBe(
      'philipithomas.com: Welcome to recurring new-post texts. Frequency varies. Message and data rates may apply. Reply HELP for help or STOP to unsubscribe.'
    )
    expect(SMS_SUBSCRIBE_CONFIRMATION).toHaveLength(151)
  })

  it('explains how to save the Bell contact card and ask a question', () => {
    expect(SMS_BELL_CONTACT_ONBOARDING).toBe(
      'philipithomas.com: Meet Bell. Open the attached card, then tap Create New Contact to save Bell so future texts have a name and face. Text Bell questions about philipithomas.com.'
    )
  })

  it('keeps a direct contact-card link for MMS failures', () => {
    expect(SMS_BELL_CONTACT_FALLBACK).toContain(
      'https://www.philipithomas.com/bell.vcf'
    )
    expect(SMS_BELL_CONTACT_FALLBACK).toContain('Create New Contact')
    expect(SMS_BELL_CONTACT_FALLBACK).not.toContain('Reply STOP')
    expect(SMS_BELL_CONTACT_FALLBACK.length).toBeLessThanOrEqual(160)
  })

  it('gives HELP senders the support and subscription details', () => {
    expect(SMS_HELP_RESPONSE).toBe(
      'philipithomas.com: Help at mail@philipithomas.com. You receive new-post texts. Frequency varies. Message and data rates may apply. Reply STOP to unsubscribe.'
    )
    expect(SMS_HELP_RESPONSE).toHaveLength(157)
  })

  it('tells app-handled STOP senders how to reactivate', () => {
    expect(SMS_UNSUBSCRIBE_CONFIRMATION).toBe(
      'philipithomas.com: You are unsubscribed. Your philipithomas.com data has been deleted. No further messages will be sent. Text START or UNSTOP to resubscribe.'
    )
    expect(SMS_UNSUBSCRIBE_CONFIRMATION).toHaveLength(157)
  })
})
