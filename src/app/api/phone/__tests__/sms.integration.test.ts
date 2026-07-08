import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('@/lib/email/ses', () =>
  import('@/test/integration/mocks').then((m) => m.sesMock())
)
vi.mock('@/lib/phone/twilio', () => ({
  sendSms: vi.fn(),
}))

import { POST as smsPost } from '@/app/api/phone/sms/route'
import { POST as voiceMenuPost } from '@/app/api/phone/voice-menu/route'
import {
  resetFailedSmsBySlug,
  SMS_SEND_SKIPPED_UNSUBSCRIBED,
} from '@/lib/db/queries/sms-sends'
import { countEligibleSms } from '@/lib/db/queries/sms-subscribers'
import { smsSends, smsSubscribers, textMessages } from '@/lib/db/schema'
import { sendSimpleEmail } from '@/lib/email/ses'
import { SMS_SUBSCRIBE_CONFIRMATION } from '@/lib/phone/sms-subscription-copy'
import { sendSms } from '@/lib/phone/twilio'
import { db, resetDb } from '@/test/integration/db'

const SECRET = 'test-webhook-secret'

function smsRequest(form: Record<string, string>, secret = SECRET) {
  return new Request(
    `https://philipithomas.com/api/phone/sms?secret=${secret}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    }
  )
}

function voiceMenuRequest(form: Record<string, string>, secret = SECRET) {
  return new Request(
    `https://philipithomas.com/api/phone/voice-menu?secret=${secret}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    }
  )
}

beforeEach(async () => {
  await resetDb()
  process.env.PHONE_WEBHOOK_SECRET = SECRET
  process.env.ADMIN_EMAILS = 'one@example.com, two@example.com'
  vi.mocked(sendSms).mockResolvedValue({ sid: 'SM_CONFIRM', status: 'queued' })
})

afterEach(() => {
  delete process.env.PHONE_WEBHOOK_SECRET
  delete process.env.ADMIN_EMAILS
  vi.clearAllMocks()
})

describe('POST /api/phone/sms', () => {
  it('rejects a wrong secret without touching the database', async () => {
    const response = await smsPost(
      smsRequest({ From: '+1', To: '+2', Body: 'x' }, 'wrong')
    )
    expect(response.status).toBe(401)
    expect(await db.select().from(textMessages)).toHaveLength(0)
  })

  it('stores the inbound message and emails a notification', async () => {
    const response = await smsPost(
      smsRequest({
        From: '+15551234567',
        To: '+12123473190',
        Body: 'Running late',
        MessageSid: 'SM123',
        SmsStatus: 'received',
      })
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<Response></Response>')

    const rows = await db.select().from(textMessages)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      fromNumber: '+15551234567',
      toNumber: '+12123473190',
      body: 'Running late',
      direction: 'inbound',
      twilioSid: 'SM123',
      status: 'received',
    })

    expect(vi.mocked(sendSimpleEmail)).toHaveBeenCalledTimes(1)
    const email = vi.mocked(sendSimpleEmail).mock.calls[0][0]
    expect(email.to).toEqual(['one@example.com', 'two@example.com'])
    expect(email.subject).toBe('SMS from +15551234567 to NYC')
    expect(email.html).toContain('Running late')
  })

  it('does not duplicate the row when Twilio redelivers the webhook', async () => {
    const form = {
      From: '+15551234567',
      To: '+12123473190',
      Body: 'Running late',
      MessageSid: 'SM123',
    }
    await smsPost(smsRequest(form))
    await smsPost(smsRequest(form))
    expect(await db.select().from(textMessages)).toHaveLength(1)
  })

  it('subscribes an SMS sender and emails an admin notification with Twilio metadata', async () => {
    const response = await smsPost(
      smsRequest({
        From: '+14155551234',
        To: '+12123473190',
        Body: 'SUBSCRIBE',
        MessageSid: 'SM_SUB',
        FromCity: 'SAN FRANCISCO',
        FromState: 'CA',
        FromCountry: 'US',
      })
    )
    expect(response.status).toBe(200)
    const xml = await response.text()
    expect(xml).toContain('You are subscribed')
    expect(xml).toContain('Reply STOP to unsubscribe')

    const subscribers = await db.select().from(smsSubscribers)
    expect(subscribers).toHaveLength(1)
    expect(subscribers[0]).toMatchObject({
      phoneNumber: '+14155551234',
      subscribedPostcard: true,
      subscribedContraption: true,
      subscribedWorkshop: true,
      subscribedTsundoku: true,
      source: 'sms:nyc',
    })
    expect(subscribers[0].confirmedAt).toBeInstanceOf(Date)
    expect(await db.select().from(textMessages)).toHaveLength(1)
    expect(vi.mocked(sendSimpleEmail)).toHaveBeenCalledTimes(1)
    const email = vi.mocked(sendSimpleEmail).mock.calls[0][0]
    expect(email.to).toEqual(['one@example.com', 'two@example.com'])
    expect(email.subject).toBe('SMS signup from +14155551234 via text')
    expect(email.html).toContain('Texted SUBSCRIBE')
    expect(email.html).toContain('SAN FRANCISCO, CA')
    expect(email.html).toContain('SM_SUB')
  })

  it('does not send another signup notification for a repeated subscribe command', async () => {
    const form = {
      From: '+14155551234',
      To: '+12123473190',
      Body: 'SUBSCRIBE',
      MessageSid: 'SM_SUB',
    }
    await smsPost(smsRequest(form))
    vi.mocked(sendSimpleEmail).mockClear()

    const response = await smsPost(
      smsRequest({ ...form, MessageSid: 'SM_SUB_AGAIN' })
    )

    expect(response.status).toBe(200)
    expect(vi.mocked(sendSimpleEmail)).not.toHaveBeenCalled()
  })

  it('unsubscribes an SMS sender from local SMS eligibility', async () => {
    await smsPost(
      smsRequest({
        From: '+15551234567',
        To: '+12123473190',
        Body: 'SUBSCRIBE',
        MessageSid: 'SM_SUB',
      })
    )
    vi.mocked(sendSimpleEmail).mockClear()

    const response = await smsPost(
      smsRequest({
        From: '+15551234567',
        To: '+12123473190',
        Body: 'STOP',
        MessageSid: 'SM_STOP',
      })
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('You are unsubscribed')
    const [subscriber] = await db.select().from(smsSubscribers)
    expect(subscriber.confirmedAt).toBeNull()
    expect(subscriber.subscribedContraption).toBe(false)
    expect(vi.mocked(sendSimpleEmail)).not.toHaveBeenCalled()
  })

  it('marks pending SMS send rows skipped when a number unsubscribes', async () => {
    await smsPost(
      smsRequest({
        From: '+15551234567',
        To: '+12123473190',
        Body: 'SUBSCRIBE',
        MessageSid: 'SM_SUB',
      })
    )
    const [subscriber] = await db.select().from(smsSubscribers)
    await db.insert(smsSends).values({
      smsSubscriberId: subscriber.id,
      postSlug: 'post-a',
      newsletter: 'postcard',
      body: 'new post',
      nextAttemptAt: new Date(),
    })

    await smsPost(
      smsRequest({
        From: '+15551234567',
        To: '+12123473190',
        Body: 'STOP',
        MessageSid: 'SM_STOP',
      })
    )

    const [send] = await db.select().from(smsSends)
    expect(send).toMatchObject({
      postSlug: 'post-a',
      sendError: SMS_SEND_SKIPPED_UNSUBSCRIBED,
      sentAt: null,
      nextAttemptAt: null,
    })

    await smsPost(
      smsRequest({
        From: '+15551234567',
        To: '+12123473190',
        Body: 'SUBSCRIBE',
        MessageSid: 'SM_RESUB',
      })
    )

    expect(await resetFailedSmsBySlug('post-a')).toBe(0)
    expect(await countEligibleSms('postcard', 'post-a')).toBe(0)
  })

  it('syncs Twilio-managed STOP webhooks without a duplicate reply', async () => {
    await smsPost(
      smsRequest({
        From: '+15551234567',
        To: '+12123473190',
        Body: 'SUBSCRIBE',
        MessageSid: 'SM_SUB',
      })
    )
    vi.mocked(sendSimpleEmail).mockClear()

    const response = await smsPost(
      smsRequest({
        From: '+15551234567',
        To: '+12123473190',
        Body: 'STOP',
        MessageSid: 'SM_STOP',
        OptOutType: 'STOP',
      })
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<Response></Response>')
    const [subscriber] = await db.select().from(smsSubscribers)
    expect(subscriber.confirmedAt).toBeNull()
    expect(subscriber.subscribedPostcard).toBe(false)
    expect(subscriber.subscribedContraption).toBe(false)
    expect(subscriber.subscribedWorkshop).toBe(false)
    expect(subscriber.subscribedTsundoku).toBe(false)
    expect(vi.mocked(sendSimpleEmail)).not.toHaveBeenCalled()
  })
})

describe('POST /api/phone/voice-menu', () => {
  it('subscribes a caller that presses 2', async () => {
    const response = await voiceMenuPost(
      voiceMenuRequest({
        From: '+14155551234',
        To: '+12123473190',
        Digits: '2',
        CallSid: 'CA_SUB',
        CallerName: 'Jane Caller',
      })
    )

    expect(response.status).toBe(200)
    const xml = await response.text()
    expect(xml).toContain('You are subscribed')
    expect(xml).toContain('I sent a confirmation text')
    expect(xml).toContain('Reply STOP')
    const subscribers = await db.select().from(smsSubscribers)
    expect(subscribers).toHaveLength(1)
    expect(subscribers[0]).toMatchObject({
      phoneNumber: '+14155551234',
      subscribedPostcard: true,
      subscribedContraption: true,
      subscribedWorkshop: true,
      subscribedTsundoku: true,
      source: 'call:nyc',
    })
    expect(vi.mocked(sendSimpleEmail)).toHaveBeenCalledTimes(1)
    const email = vi.mocked(sendSimpleEmail).mock.calls[0][0]
    expect(email.subject).toBe('SMS signup from +14155551234 via voice menu')
    expect(email.html).toContain('Pressed 2 during a phone call')
    expect(email.html).toContain('Area code 415: San Francisco, CA')
    expect(email.html).toContain('Jane Caller')
    expect(email.html).toContain('CA_SUB')
    expect(vi.mocked(sendSms)).toHaveBeenCalledWith({
      from: '+12123473190',
      to: '+14155551234',
      body: SMS_SUBSCRIBE_CONFIRMATION,
    })
    const messages = await db.select().from(textMessages)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      fromNumber: '+12123473190',
      toNumber: '+14155551234',
      body: SMS_SUBSCRIBE_CONFIRMATION,
      direction: 'outbound',
      twilioSid: 'SM_CONFIRM',
      status: 'queued',
    })
  })

  it('still gives spoken STOP instructions when voice confirmation SMS fails', async () => {
    vi.mocked(sendSms).mockRejectedValueOnce(new Error('Twilio rejected it'))

    const response = await voiceMenuPost(
      voiceMenuRequest({
        From: '+14155551234',
        To: '+12123473190',
        Digits: '2',
      })
    )

    expect(response.status).toBe(200)
    const xml = await response.text()
    expect(xml).toContain('You are subscribed')
    expect(xml).toContain('Text STOP at any time to unsubscribe')
    const messages = await db.select().from(textMessages)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      fromNumber: '+12123473190',
      toNumber: '+14155551234',
      body: SMS_SUBSCRIBE_CONFIRMATION,
      direction: 'outbound',
      twilioSid: null,
      status: 'failed',
    })
  })

  it('falls back to voicemail when the caller presses 1', async () => {
    const response = await voiceMenuPost(
      voiceMenuRequest({
        From: '+15551234567',
        To: '+12123473190',
        Digits: '1',
      })
    )

    expect(response.status).toBe(200)
    const xml = await response.text()
    expect(xml).toContain('Leave a message after the tone.')
    expect(xml).toContain('<Record maxLength="120"')
    expect(await db.select().from(smsSubscribers)).toHaveLength(0)
  })
})
