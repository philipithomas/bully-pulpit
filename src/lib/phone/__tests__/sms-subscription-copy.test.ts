import { describe, expect, it } from 'vitest'
import {
  SMS_BELL_CONTACT_ONBOARDING,
  SMS_HELP_RESPONSE,
  SMS_SUBSCRIBE_CONFIRMATION,
  SMS_UNSUBSCRIBE_CONFIRMATION,
} from '@/lib/phone/sms-subscription-copy'

describe('SMS subscription copy', () => {
  it('includes the required subscription disclosures', () => {
    expect(SMS_SUBSCRIBE_CONFIRMATION).toBe(
      'philipithomas.com: You are subscribed to recurring new-post texts. Frequency varies. Message and data rates may apply. Reply HELP for help or STOP to unsubscribe.'
    )
    expect(SMS_SUBSCRIBE_CONFIRMATION).toHaveLength(162)
  })

  it('introduces the Bell contact card without promising AI replies', () => {
    expect(SMS_BELL_CONTACT_ONBOARDING).toBe(
      'philipithomas.com: Meet Bell, the little bell that carries new posts from Philip. Add the attached contact card so the next text has a face. Reply STOP to unsubscribe.'
    )
  })

  it('gives HELP senders the support and subscription details', () => {
    expect(SMS_HELP_RESPONSE).toBe(
      'philipithomas.com: Help at mail@philipithomas.com. You receive new-post texts. Frequency varies. Message and data rates may apply. Reply STOP to unsubscribe.'
    )
    expect(SMS_HELP_RESPONSE).toHaveLength(157)
  })

  it('tells app-handled STOP senders how to reactivate', () => {
    expect(SMS_UNSUBSCRIBE_CONFIRMATION).toBe(
      'philipithomas.com: You are unsubscribed from new-post texts. No further messages will be sent. Reply START or UNSTOP to resubscribe.'
    )
  })
})
