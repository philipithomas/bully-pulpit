import { describe, expect, it } from 'vitest'
import {
  SMS_BELL_CONTACT_ONBOARDING,
  SMS_HELP_RESPONSE,
  SMS_SUBSCRIBE_CONFIRMATION,
} from '@/lib/phone/sms-subscription-copy'

describe('SMS subscription copy', () => {
  it('includes the required subscription disclosures', () => {
    expect(SMS_SUBSCRIBE_CONFIRMATION).toBe(
      'philipithomas.com: You are subscribed to new-post texts. Frequency varies. Message and data rates may apply. Reply HELP for help or STOP to unsubscribe.'
    )
    expect(SMS_SUBSCRIBE_CONFIRMATION).toHaveLength(152)
  })

  it('introduces the Bell contact card without promising AI replies', () => {
    expect(SMS_BELL_CONTACT_ONBOARDING).toBe(
      'Meet Bell, the little bell that carries new posts from Philip. Add the attached contact card so the next text has a face.'
    )
  })

  it('gives HELP senders the support and subscription details', () => {
    expect(SMS_HELP_RESPONSE).toBe(
      'philipithomas.com: Help at mail@philipithomas.com. You receive new-post texts. Frequency varies. Message and data rates may apply. Reply STOP to unsubscribe.'
    )
    expect(SMS_HELP_RESPONSE).toHaveLength(157)
  })
})
