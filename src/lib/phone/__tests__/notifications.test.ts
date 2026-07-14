import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email/ses', () => ({
  sendSimpleEmail: vi.fn(async () => undefined),
}))

import { sendSimpleEmail } from '@/lib/email/ses'
import { sendIncomingSmsNotification } from '@/lib/phone/notifications'

describe('phone notifications', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'one@example.com, two@example.com'
    process.env.PHONE_NUMBER = '+12123473190'
  })

  afterEach(() => {
    delete process.env.ADMIN_EMAILS
    delete process.env.PHONE_NUMBER
    vi.clearAllMocks()
  })

  it('includes the Bell reply and canonical receipt time in an SMS email', async () => {
    await sendIncomingSmsNotification({
      from: '+15551234567',
      to: '+12123473190',
      body: 'What is new?',
      bellResponse: '[Bell AI] A new Postcard.',
      bellReplyFailed: true,
      receivedAt: new Date('2026-07-13T20:30:00.000Z'),
    })

    expect(sendSimpleEmail).toHaveBeenCalledTimes(1)
    const email = vi.mocked(sendSimpleEmail).mock.calls[0][0]
    expect(email.to).toEqual(['one@example.com', 'two@example.com'])
    expect(email.subject).toBe('SMS from +15551234567 to Phone')
    expect(email.html).toContain('What is new?')
    expect(email.html).toContain('[Bell AI] A new Postcard.')
    expect(email.html).toContain('2026-07-13 20:30 UTC')
    expect(email.html).toContain('Twilio did not confirm the Bell reply.')
    expect(email.text).toContain('Bell reply:')
    expect(email.text).toContain('[Bell AI] A new Postcard.')
    expect(email.text).toContain('2026-07-13 20:30 UTC')
  })
})
