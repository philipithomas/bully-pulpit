import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const afterTasks = vi.hoisted(() => [] as Promise<void>[])

async function flushAfterTasks() {
  await Promise.all(afterTasks.splice(0))
}

// Capture after() callbacks so tests can assert post-response side effects.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: (task: (() => Promise<void>) | Promise<void>) => {
      afterTasks.push(
        Promise.resolve(typeof task === 'function' ? task() : task)
      )
    },
  }
})
vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('@/lib/email/ses', () =>
  import('@/test/integration/mocks').then((m) => m.sesMock())
)
vi.mock('@/lib/phone/twilio', () => ({
  sendSms: vi.fn(),
}))
vi.mock('@/lib/flags', () => ({
  smsSignupUi: vi.fn(async () => false),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => true),
}))
vi.mock('workflow/api', () => ({ start: vi.fn() }))
vi.mock('@/workflows/reply-to-sms', () => ({
  replyToSmsWorkflow: vi.fn(),
}))

import { start } from 'workflow/api'
import { POST as smsPost } from '@/app/api/phone/sms/route'
import { POST as voiceMenuPost } from '@/app/api/phone/voice-menu/route'
import {
  resetFailedSmsBySlug,
  SMS_SEND_SKIPPED_UNSUBSCRIBED,
} from '@/lib/db/queries/sms-sends'
import {
  claimBellContactCard,
  countEligibleSms,
  refreshBellContactCardClaim,
  subscribeSmsNumber,
  unsubscribeSmsNumber,
} from '@/lib/db/queries/sms-subscribers'
import { smsSends, smsSubscribers, textMessages } from '@/lib/db/schema'
import { sendSimpleEmail } from '@/lib/email/ses'
import { smsSignupUi } from '@/lib/flags'
import {
  SMS_BELL_CONTACT_ONBOARDING,
  SMS_HELP_RESPONSE,
  SMS_SUBSCRIBE_CONFIRMATION,
} from '@/lib/phone/sms-subscription-copy'
import { sendSms } from '@/lib/phone/twilio'
import { checkRateLimit } from '@/lib/rate-limit'
import { db, resetDb } from '@/test/integration/db'
import { replyToSmsWorkflow } from '@/workflows/reply-to-sms'

const SECRET = 'test-webhook-secret'
let mediaSendCount = 0

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
  afterTasks.length = 0
  mediaSendCount = 0
  await resetDb()
  process.env.PHONE_NUMBER = '+12123473190'
  process.env.TWILIO_SECRET = SECRET
  process.env.ADMIN_EMAILS = 'one@example.com, two@example.com'
  vi.mocked(smsSignupUi).mockResolvedValue(false)
  vi.mocked(checkRateLimit).mockResolvedValue(true)
  vi.mocked(sendSms).mockImplementation(async (input) => {
    if (input.mediaUrl) {
      mediaSendCount += 1
      return {
        sid: mediaSendCount === 1 ? 'MM_BELL' : `MM_BELL_${mediaSendCount}`,
        status: 'queued',
      }
    }
    return { sid: 'SM_CONFIRM', status: 'queued' }
  })
  vi.mocked(start).mockResolvedValue({
    runId: 'wrun_sms',
    // biome-ignore lint/suspicious/noExplicitAny: partial workflow run
  } as any)
})

afterEach(async () => {
  await flushAfterTasks()
  delete process.env.PHONE_NUMBER
  delete process.env.TWILIO_SECRET
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
    expect(email.subject).toBe('SMS from +15551234567 to Phone')
    expect(email.html).toContain('Running late')
    expect(start).toHaveBeenCalledWith(replyToSmsWorkflow, [
      {
        from: '+15551234567',
        to: '+12123473190',
        inboundMessageId: rows[0].id,
      },
    ])
  })

  it('does not duplicate the row when Twilio redelivers the webhook', async () => {
    const form = {
      From: '+15551234567',
      To: '+12123473190',
      Body: 'Running late',
      MessageSid: 'SM123',
    }
    const first = await smsPost(smsRequest(form))
    const duplicate = await smsPost(smsRequest(form))
    expect(first.status).toBe(200)
    expect(duplicate.status).toBe(200)
    expect(await db.select().from(textMessages)).toHaveLength(1)
    expect(vi.mocked(sendSimpleEmail)).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('claims concurrent webhook duplicates before starting Bell', async () => {
    let finishStart:
      | ((run: Awaited<ReturnType<typeof start>>) => void)
      | undefined
    vi.mocked(start).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishStart = resolve
        })
    )
    const form = {
      From: '+15551234567',
      To: '+12123473190',
      Body: 'Running late',
      MessageSid: 'SM_CONCURRENT',
    }

    const first = smsPost(smsRequest(form))
    await vi.waitFor(() => {
      expect(start).toHaveBeenCalledTimes(1)
    })
    const duplicate = await smsPost(smsRequest(form))
    finishStart?.({
      runId: 'wrun_concurrent',
      // biome-ignore lint/suspicious/noExplicitAny: partial workflow run
    } as any)
    await first

    expect(duplicate.status).toBe(503)
    expect(await duplicate.text()).toContain('<Response></Response>')
    expect(sendSimpleEmail).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('does not block Bell when the admin notification fails', async () => {
    vi.mocked(sendSimpleEmail).mockRejectedValueOnce(new Error('SES offline'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const form = {
      From: '+15551234567',
      To: '+12123473190',
      Body: 'Running late',
      MessageSid: 'SM123',
    }

    const response = await smsPost(smsRequest(form))
    await flushAfterTasks()
    const duplicate = await smsPost(smsRequest(form))

    expect(response.status).toBe(200)
    expect(duplicate.status).toBe(200)
    expect(await response.text()).toContain('<Response></Response>')
    expect(await db.select().from(textMessages)).toHaveLength(1)
    expect(vi.mocked(sendSimpleEmail)).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      '[phone/sms] incoming SMS notification failed:',
      expect.any(Error)
    )
  })

  it('releases the webhook claim when workflow enqueue fails', async () => {
    vi.mocked(start)
      .mockRejectedValueOnce(new Error('workflow unavailable'))
      .mockResolvedValueOnce({
        runId: 'wrun_retry',
        // biome-ignore lint/suspicious/noExplicitAny: partial workflow run
      } as any)
    const form = {
      From: '+15551234567',
      To: '+12123473190',
      Body: 'What is new?',
      MessageSid: 'SM_WORKFLOW_RETRY',
    }

    await expect(smsPost(smsRequest(form))).rejects.toThrow(
      'workflow unavailable'
    )
    const response = await smsPost(smsRequest(form))

    expect(response.status).toBe(200)
    expect(start).toHaveBeenCalledTimes(2)
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
    expect(xml).toContain('Frequency varies')
    expect(xml).toContain('Message and data rates may apply')
    expect(xml).toContain('Reply HELP for help')
    expect(xml).toContain('or STOP to unsubscribe')
    expect(xml).not.toContain(SMS_BELL_CONTACT_ONBOARDING)
    expect(xml).not.toContain('<Media>')
    expect(xml.match(/<Message>/g)).toHaveLength(1)

    const subscribers = await db.select().from(smsSubscribers)
    expect(subscribers).toHaveLength(1)
    expect(subscribers[0]).toMatchObject({
      phoneNumber: '+14155551234',
      subscribedPostcard: true,
      subscribedContraption: true,
      subscribedWorkshop: true,
      subscribedTsundoku: true,
      source: 'sms:phone',
    })
    expect(subscribers[0].confirmedAt).toBeInstanceOf(Date)
    await flushAfterTasks()
    expect(vi.mocked(sendSms)).toHaveBeenCalledWith({
      from: '+12123473190',
      to: '+14155551234',
      body: SMS_BELL_CONTACT_ONBOARDING,
      mediaUrl: 'https://www.philipithomas.com/bell.vcf',
    })
    const messages = await db.select().from(textMessages)
    expect(messages).toHaveLength(2)
    expect(messages).toContainEqual(
      expect.objectContaining({
        fromNumber: '+12123473190',
        toNumber: '+14155551234',
        body: SMS_BELL_CONTACT_ONBOARDING,
        direction: 'outbound',
        twilioSid: 'MM_BELL',
        status: 'queued',
      })
    )
    const [updatedSubscriber] = await db.select().from(smsSubscribers)
    expect(updatedSubscriber.bellContactCardProcessingAt).toBeNull()
    expect(updatedSubscriber.bellContactCardSentAt).toBeInstanceOf(Date)
    expect(vi.mocked(sendSimpleEmail)).toHaveBeenCalledTimes(1)
    const email = vi.mocked(sendSimpleEmail).mock.calls[0][0]
    expect(email.to).toEqual(['one@example.com', 'two@example.com'])
    expect(email.subject).toBe('SMS signup from +14155551234 via text')
    expect(email.html).toContain('Texted SUBSCRIBE')
    expect(email.html).toContain('SAN FRANCISCO, CA')
    expect(email.html).toContain('SM_SUB')
    expect(start).not.toHaveBeenCalled()
  })

  it('does not send another signup notification for a repeated subscribe command', async () => {
    const form = {
      From: '+14155551234',
      To: '+12123473190',
      Body: 'SUBSCRIBE',
      MessageSid: 'SM_SUB',
    }
    await smsPost(smsRequest(form))
    await flushAfterTasks()
    vi.mocked(sendSimpleEmail).mockClear()
    vi.mocked(sendSms).mockClear()

    const response = await smsPost(
      smsRequest({ ...form, MessageSid: 'SM_SUB_AGAIN' })
    )

    expect(response.status).toBe(200)
    const xml = await response.text()
    expect(xml).toContain(SMS_SUBSCRIBE_CONFIRMATION)
    expect(xml).not.toContain(SMS_BELL_CONTACT_ONBOARDING)
    expect(xml).not.toContain('<Media>')
    await flushAfterTasks()
    expect(vi.mocked(sendSms)).not.toHaveBeenCalled()
    expect(vi.mocked(sendSimpleEmail)).not.toHaveBeenCalled()
  })

  it('retries the Bell card after Twilio rejects the first MMS', async () => {
    vi.mocked(sendSms).mockRejectedValueOnce(new Error('MMS rejected'))

    await smsPost(
      smsRequest({
        From: '+14155551234',
        To: '+12123473190',
        Body: 'SUBSCRIBE',
        MessageSid: 'SM_SUB_FAIL',
      })
    )
    await flushAfterTasks()

    const [subscriber] = await db.select().from(smsSubscribers)
    expect(subscriber.bellContactCardProcessingAt).toBeNull()
    expect(subscriber.bellContactCardSentAt).toBeNull()
    expect(await db.select().from(textMessages)).toContainEqual(
      expect.objectContaining({
        body: SMS_BELL_CONTACT_ONBOARDING,
        direction: 'outbound',
        twilioSid: null,
        status: 'failed',
      })
    )

    await smsPost(
      smsRequest({
        From: '+14155551234',
        To: '+12123473190',
        Body: 'SUBSCRIBE',
        MessageSid: 'SM_SUB_RETRY',
      })
    )
    await flushAfterTasks()

    expect(vi.mocked(sendSms)).toHaveBeenCalledTimes(2)
    const [retriedSubscriber] = await db.select().from(smsSubscribers)
    expect(retriedSubscriber.bellContactCardProcessingAt).toBeNull()
    expect(retriedSubscriber.bellContactCardSentAt).toBeInstanceOf(Date)
    const onboardingAttempts = (await db.select().from(textMessages)).filter(
      (message) => message.body === SMS_BELL_CONTACT_ONBOARDING
    )
    expect(onboardingAttempts).toHaveLength(2)
    expect(onboardingAttempts.map((message) => message.status).sort()).toEqual([
      'failed',
      'queued',
    ])
  })

  it('sends one Bell card when text and voice signups race', async () => {
    vi.mocked(smsSignupUi).mockResolvedValue(true)

    await Promise.all([
      smsPost(
        smsRequest({
          From: '+14155551234',
          To: '+12123473190',
          Body: 'SUBSCRIBE',
          MessageSid: 'SM_SUB_RACE',
        })
      ),
      voiceMenuPost(
        voiceMenuRequest({
          From: '+14155551234',
          To: '+12123473190',
          Digits: '2',
          CallSid: 'CA_SUB_RACE',
        })
      ),
    ])
    await flushAfterTasks()

    const mediaCalls = vi
      .mocked(sendSms)
      .mock.calls.filter(([input]) => Boolean(input.mediaUrl))
    expect(mediaCalls).toHaveLength(1)
    const onboardingMessages = (await db.select().from(textMessages)).filter(
      (message) =>
        message.direction === 'outbound' &&
        message.body === SMS_BELL_CONTACT_ONBOARDING
    )
    expect(onboardingMessages).toHaveLength(1)
    const [subscriber] = await db.select().from(smsSubscribers)
    expect(subscriber.bellContactCardProcessingAt).toBeNull()
    expect(subscriber.bellContactCardSentAt).toBeInstanceOf(Date)
  })

  it('invalidates an old Bell claim across unsubscribe and reactivation', async () => {
    const phoneNumber = '+14155551234'
    await subscribeSmsNumber({ phoneNumber })
    const oldClaim = await claimBellContactCard(phoneNumber)
    expect(oldClaim).not.toBeNull()

    await unsubscribeSmsNumber(phoneNumber)
    await subscribeSmsNumber({ phoneNumber })
    const newClaim = await claimBellContactCard(phoneNumber)
    expect(newClaim).not.toBeNull()
    if (!oldClaim || !newClaim) throw new Error('Expected Bell claims')
    expect(newClaim.id).not.toBe(oldClaim.id)

    expect(await refreshBellContactCardClaim(phoneNumber, oldClaim)).toBe(false)
    expect(await refreshBellContactCardClaim(phoneNumber, newClaim)).toBe(true)
  })

  it('answers HELP without routing it to the admin inbox', async () => {
    const response = await smsPost(
      smsRequest({
        From: '+14155551234',
        To: '+12123473190',
        Body: 'HELP',
        MessageSid: 'SM_HELP',
      })
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toContain(SMS_HELP_RESPONSE)
    expect(vi.mocked(sendSimpleEmail)).not.toHaveBeenCalled()
    expect(await db.select().from(textMessages)).toHaveLength(1)

    const duplicate = await smsPost(
      smsRequest({
        From: '+14155551234',
        To: '+12123473190',
        Body: 'HELP',
        MessageSid: 'SM_HELP',
      })
    )
    expect(await duplicate.text()).toContain('<Response></Response>')
    expect(await db.select().from(textMessages)).toHaveLength(1)
  })

  it('does not duplicate Twilio Advanced Opt-Out HELP replies', async () => {
    const response = await smsPost(
      smsRequest({
        From: '+14155551234',
        To: '+12123473190',
        Body: 'HELP',
        MessageSid: 'SM_HELP',
        OptOutType: 'HELP',
      })
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<Response></Response>')
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
    await flushAfterTasks()
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
    expect(subscriber.bellContactCardProcessingAt).toBeNull()
    expect(subscriber.bellContactCardSentAt).toBeNull()
    expect(vi.mocked(sendSimpleEmail)).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })

  it('ignores duplicate command webhooks after MessageSid dedupe', async () => {
    const subscribeForm = {
      From: '+15551234567',
      To: '+12123473190',
      Body: 'SUBSCRIBE',
      MessageSid: 'SM_SUB',
    }
    const stopForm = {
      From: '+15551234567',
      To: '+12123473190',
      Body: 'STOP',
      MessageSid: 'SM_STOP',
    }

    await smsPost(smsRequest(subscribeForm))
    await flushAfterTasks()
    await smsPost(smsRequest(stopForm))
    vi.mocked(sendSimpleEmail).mockClear()

    const duplicateSubscribe = await smsPost(smsRequest(subscribeForm))
    expect(await duplicateSubscribe.text()).toContain('<Response></Response>')
    const [subscriber] = await db.select().from(smsSubscribers)
    expect(subscriber.confirmedAt).toBeNull()
    expect(vi.mocked(sendSimpleEmail)).not.toHaveBeenCalled()
    expect(await db.select().from(textMessages)).toHaveLength(3)

    const resubscribe = await smsPost(
      smsRequest({
        ...subscribeForm,
        MessageSid: 'SM_RESUB',
      })
    )
    expect(await resubscribe.text()).toContain(SMS_SUBSCRIBE_CONFIRMATION)
    await flushAfterTasks()
    vi.mocked(sendSimpleEmail).mockClear()

    const duplicateStop = await smsPost(smsRequest(stopForm))
    expect(await duplicateStop.text()).toContain('<Response></Response>')
    const [subscriberAfterDuplicateStop] = await db
      .select()
      .from(smsSubscribers)
    expect(subscriberAfterDuplicateStop.confirmedAt).toBeInstanceOf(Date)
    expect(vi.mocked(sendSimpleEmail)).not.toHaveBeenCalled()
    expect(await db.select().from(textMessages)).toHaveLength(5)
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
    await db.insert(smsSends).values([
      {
        smsSubscriberId: subscriber.id,
        postSlug: 'post-a',
        newsletter: 'postcard',
        body: 'new post',
        nextAttemptAt: new Date(),
      },
      {
        smsSubscriberId: subscriber.id,
        postSlug: 'post-b',
        newsletter: 'postcard',
        body: 'retryable old post',
        sendError: 'Twilio rejected the message',
        nextAttemptAt: new Date(),
      },
    ])

    await smsPost(
      smsRequest({
        From: '+15551234567',
        To: '+12123473190',
        Body: 'STOP',
        MessageSid: 'SM_STOP',
      })
    )

    const sends = (await db.select().from(smsSends)).sort((a, b) =>
      a.postSlug.localeCompare(b.postSlug)
    )
    expect(sends).toMatchObject([
      {
        postSlug: 'post-a',
        sendError: SMS_SEND_SKIPPED_UNSUBSCRIBED,
        sentAt: null,
        nextAttemptAt: null,
      },
      {
        postSlug: 'post-b',
        sendError: SMS_SEND_SKIPPED_UNSUBSCRIBED,
        sentAt: null,
        nextAttemptAt: null,
      },
    ])

    await smsPost(
      smsRequest({
        From: '+15551234567',
        To: '+12123473190',
        Body: 'SUBSCRIBE',
        MessageSid: 'SM_RESUB',
      })
    )

    expect(await resetFailedSmsBySlug('post-a')).toBe(0)
    expect(await resetFailedSmsBySlug('post-b')).toBe(0)
    expect(await countEligibleSms('postcard', 'post-a')).toBe(0)
    expect(await countEligibleSms('postcard', 'post-b')).toBe(0)
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
    await flushAfterTasks()
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

  it('does not add Bell or email replies to Twilio-managed HELP', async () => {
    const response = await smsPost(
      smsRequest({
        From: '+15551234567',
        To: '+12123473190',
        Body: 'HELP',
        MessageSid: 'SM_HELP',
        OptOutType: 'HELP',
      })
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<Response></Response>')
    expect(start).not.toHaveBeenCalled()
    expect(sendSimpleEmail).not.toHaveBeenCalled()
  })

  it('adds the one-time Bell card after a Twilio-managed START reply', async () => {
    const response = await smsPost(
      smsRequest({
        From: '+15551234567',
        To: '+12123473190',
        Body: 'START',
        MessageSid: 'SM_START',
        OptOutType: 'START',
      })
    )

    expect(response.status).toBe(200)
    const xml = await response.text()
    expect(xml).not.toContain(SMS_SUBSCRIBE_CONFIRMATION)
    expect(xml).not.toContain(SMS_BELL_CONTACT_ONBOARDING)
    expect(xml).not.toContain('<Media>')
    await flushAfterTasks()
    expect(vi.mocked(sendSms)).toHaveBeenCalledWith({
      from: '+12123473190',
      to: '+15551234567',
      body: SMS_BELL_CONTACT_ONBOARDING,
      mediaUrl: 'https://www.philipithomas.com/bell.vcf',
    })
    expect(await db.select().from(textMessages)).toContainEqual(
      expect.objectContaining({
        body: SMS_BELL_CONTACT_ONBOARDING,
        direction: 'outbound',
        twilioSid: 'MM_BELL',
      })
    )
    const [subscriber] = await db.select().from(smsSubscribers)
    expect(subscriber.confirmedAt).toBeInstanceOf(Date)
  })

  it('rate-limits Bell by sender after compliance commands are handled', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce(false)
    const response = await smsPost(
      smsRequest({
        From: '+15551234567',
        To: '+12123473190',
        Body: 'Tell me everything',
        MessageSid: 'SM_RATE_LIMITED',
      })
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toContain(
      '[Bell AI] Too many messages. Please try again later.'
    )
    expect(checkRateLimit).toHaveBeenCalledWith(
      'chat',
      'phone:+15551234567',
      expect.any(Request)
    )
    expect(start).not.toHaveBeenCalled()
    const rows = await db.select().from(textMessages)
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({
      direction: 'outbound',
      status: 'queued',
      replyToMessageId: rows[0].id,
    })
  })
})

describe('POST /api/phone/voice-menu', () => {
  it('subscribes a caller that presses 2', async () => {
    vi.mocked(smsSignupUi).mockResolvedValue(true)

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
    expect(xml).toContain('Text STOP to unsubscribe or HELP for help')
    const subscribers = await db.select().from(smsSubscribers)
    expect(subscribers).toHaveLength(1)
    expect(subscribers[0]).toMatchObject({
      phoneNumber: '+14155551234',
      subscribedPostcard: true,
      subscribedContraption: true,
      subscribedWorkshop: true,
      subscribedTsundoku: true,
      source: 'call:phone',
    })
    await flushAfterTasks()
    expect(vi.mocked(sendSimpleEmail)).toHaveBeenCalledTimes(1)
    const email = vi.mocked(sendSimpleEmail).mock.calls[0][0]
    expect(email.subject).toBe('SMS signup from +14155551234 via voice menu')
    expect(email.html).toContain('Pressed 2 during a phone call')
    expect(email.html).toContain('Area code 415: San Francisco, CA')
    expect(email.html).toContain('Jane Caller')
    expect(email.html).toContain('CA_SUB')
    expect(vi.mocked(sendSms)).toHaveBeenNthCalledWith(1, {
      from: '+12123473190',
      to: '+14155551234',
      body: SMS_SUBSCRIBE_CONFIRMATION,
    })
    expect(vi.mocked(sendSms)).toHaveBeenNthCalledWith(2, {
      from: '+12123473190',
      to: '+14155551234',
      body: SMS_BELL_CONTACT_ONBOARDING,
      mediaUrl: 'https://www.philipithomas.com/bell.vcf',
    })
    const messages = await db.select().from(textMessages)
    expect(messages).toHaveLength(2)
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromNumber: '+12123473190',
          toNumber: '+14155551234',
          body: SMS_SUBSCRIBE_CONFIRMATION,
          direction: 'outbound',
          twilioSid: 'SM_CONFIRM',
          status: 'queued',
        }),
        expect.objectContaining({
          fromNumber: '+12123473190',
          toNumber: '+14155551234',
          body: SMS_BELL_CONTACT_ONBOARDING,
          direction: 'outbound',
          twilioSid: 'MM_BELL',
          status: 'queued',
        }),
      ])
    )
  })

  it('does not resend the Bell card to an already-active voice subscriber', async () => {
    vi.mocked(smsSignupUi).mockResolvedValue(true)
    const form = {
      From: '+14155551234',
      To: '+12123473190',
      Digits: '2',
    }

    await voiceMenuPost(voiceMenuRequest({ ...form, CallSid: 'CA_SUB_FIRST' }))
    await flushAfterTasks()
    vi.mocked(sendSms).mockClear()
    vi.mocked(sendSimpleEmail).mockClear()

    await voiceMenuPost(voiceMenuRequest({ ...form, CallSid: 'CA_SUB_AGAIN' }))
    await flushAfterTasks()

    expect(vi.mocked(sendSms)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendSms)).toHaveBeenCalledWith({
      from: '+12123473190',
      to: '+14155551234',
      body: SMS_SUBSCRIBE_CONFIRMATION,
    })
    expect(vi.mocked(sendSimpleEmail)).not.toHaveBeenCalled()
  })

  it('falls back to voicemail when the SMS signup UI flag is off', async () => {
    const response = await voiceMenuPost(
      voiceMenuRequest({
        From: '+14155551234',
        To: '+12123473190',
        Digits: '2',
      })
    )

    expect(response.status).toBe(200)
    const xml = await response.text()
    expect(xml).toContain('Leave a message after the tone.')
    expect(xml).toContain('<Record maxLength="120"')
    expect(await db.select().from(smsSubscribers)).toHaveLength(0)
    expect(vi.mocked(sendSms)).not.toHaveBeenCalled()
  })

  it('ignores duplicate voice-menu CallSid after the caller has opted out', async () => {
    vi.mocked(smsSignupUi).mockResolvedValue(true)
    const voiceForm = {
      From: '+14155551234',
      To: '+12123473190',
      Digits: '2',
      CallSid: 'CA_SUB',
    }

    await voiceMenuPost(voiceMenuRequest(voiceForm))
    await flushAfterTasks()
    expect(vi.mocked(sendSms)).toHaveBeenCalledTimes(2)

    await smsPost(
      smsRequest({
        From: '+14155551234',
        To: '+12123473190',
        Body: 'STOP',
        MessageSid: 'SM_STOP',
      })
    )
    vi.mocked(sendSms).mockClear()

    const duplicate = await voiceMenuPost(voiceMenuRequest(voiceForm))
    const xml = await duplicate.text()

    expect(xml).toContain('already handled')
    await flushAfterTasks()
    expect(vi.mocked(sendSms)).not.toHaveBeenCalled()
    const [subscriber] = await db.select().from(smsSubscribers)
    expect(subscriber.confirmedAt).toBeNull()
  })

  it('still gives spoken STOP instructions when voice confirmation SMS fails', async () => {
    vi.mocked(smsSignupUi).mockResolvedValue(true)
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
    expect(xml).toContain('Text STOP to unsubscribe or HELP for help')
    await flushAfterTasks()
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
    expect(vi.mocked(sendSms)).toHaveBeenCalledTimes(1)
  })

  it('keeps the confirmation when the optional Bell onboarding MMS fails', async () => {
    vi.mocked(smsSignupUi).mockResolvedValue(true)
    vi.mocked(sendSms)
      .mockResolvedValueOnce({ sid: 'SM_CONFIRM', status: 'queued' })
      .mockRejectedValueOnce(new Error('MMS rejected'))

    const response = await voiceMenuPost(
      voiceMenuRequest({
        From: '+14155551234',
        To: '+12123473190',
        Digits: '2',
        CallSid: 'CA_MMS_FAIL',
      })
    )

    expect(response.status).toBe(200)
    await flushAfterTasks()
    expect(vi.mocked(sendSms)).toHaveBeenCalledTimes(2)
    const messages = await db.select().from(textMessages)
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: SMS_SUBSCRIBE_CONFIRMATION,
          twilioSid: 'SM_CONFIRM',
          status: 'queued',
        }),
        expect.objectContaining({
          body: SMS_BELL_CONTACT_ONBOARDING,
          twilioSid: null,
          status: 'failed',
        }),
      ])
    )
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
