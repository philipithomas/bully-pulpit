import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sleep } from 'workflow'

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
vi.mock('@/lib/phone/twilio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/phone/twilio')>()
  return { ...actual, sendSms: vi.fn() }
})
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => true),
}))
vi.mock('workflow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('workflow')>()
  return { ...actual, sleep: vi.fn(async () => {}) }
})
vi.mock('workflow/api', () => ({ start: vi.fn() }))
vi.mock('@/workflows/reply-to-sms', () => ({
  replyToSmsWorkflow: vi.fn(),
}))

import { start } from 'workflow/api'
import { POST as smsPost } from '@/app/api/phone/sms/route'
import { POST as voiceMenuPost } from '@/app/api/phone/voice-menu/route'
import { resetFailedSmsBySlug } from '@/lib/db/queries/sms-sends'
import {
  claimBellContactCard,
  countEligibleSms,
  deleteSmsDataForPhoneNumber,
  refreshBellContactCardClaim,
  subscribeSmsNumber,
} from '@/lib/db/queries/sms-subscribers'
import {
  bellConversations,
  bellGenerations,
  bellMessages,
  smsSends,
  smsSubscribers,
  textMessages,
} from '@/lib/db/schema'
import { sendSimpleEmail } from '@/lib/email/ses'
import { fixedBellSmsBody } from '@/lib/phone/bell-sms-copy'
import {
  SMS_BELL_CONTACT_ONBOARDING,
  SMS_HELP_RESPONSE,
  SMS_SUBSCRIBE_CONFIRMATION,
} from '@/lib/phone/sms-subscription-copy'
import { sendSms } from '@/lib/phone/twilio'
import { checkRateLimit } from '@/lib/rate-limit'
import { db, resetDb } from '@/test/integration/db'
import { twilioPostRequest } from '@/test/twilio'
import { replyToSmsWorkflow } from '@/workflows/reply-to-sms'
import {
  type SmsSignupOnboardingInput,
  smsSignupOnboardingWorkflow,
} from '@/workflows/sms-signup-onboarding'

const SECRET = 'test-webhook-secret'
let mediaSendCount = 0
let smsSendCount = 0

function smsRequest(form: Record<string, string>, signature?: string) {
  return twilioPostRequest(
    'https://philipithomas.com/api/phone/sms',
    form,
    SECRET,
    { signature }
  )
}

function voiceMenuRequest(form: Record<string, string>) {
  return twilioPostRequest(
    'https://philipithomas.com/api/phone/voice-menu',
    form,
    SECRET
  )
}

beforeEach(async () => {
  afterTasks.length = 0
  mediaSendCount = 0
  smsSendCount = 0
  await resetDb()
  process.env.PHONE_NUMBER = '+12123473190'
  process.env.TWILIO_SECRET = SECRET
  process.env.ADMIN_EMAILS = 'one@example.com, two@example.com'
  vi.mocked(checkRateLimit).mockResolvedValue(true)
  vi.mocked(sendSms).mockImplementation(async (input) => {
    if (input.mediaUrl) {
      mediaSendCount += 1
      return {
        sid: mediaSendCount === 1 ? 'MM_BELL' : `MM_BELL_${mediaSendCount}`,
        status: 'queued',
      }
    }
    smsSendCount += 1
    return {
      sid: smsSendCount === 1 ? 'SM_CONFIRM' : `SM_CONFIRM_${smsSendCount}`,
      status: 'queued',
    }
  })
  vi.mocked(start).mockImplementation(async (workflow, args) => {
    if (workflow === smsSignupOnboardingWorkflow) {
      const [input] = args as unknown as [SmsSignupOnboardingInput]
      await smsSignupOnboardingWorkflow(input)
    }
    return {
      runId: 'wrun_sms',
      // biome-ignore lint/suspicious/noExplicitAny: partial workflow run
    } as any
  })
})

afterEach(async () => {
  await flushAfterTasks()
  delete process.env.PHONE_NUMBER
  delete process.env.TWILIO_SECRET
  delete process.env.ADMIN_EMAILS
  vi.clearAllMocks()
})

describe('POST /api/phone/sms', () => {
  it('excludes historical Tsundoku-only rows from SMS eligibility', async () => {
    await db.insert(smsSubscribers).values({
      phoneNumber: '+15551234567',
      confirmedAt: new Date(),
      subscribedPostcard: false,
      subscribedContraption: false,
      subscribedWorkshop: false,
      subscribedTsundoku: true,
    })

    expect(await countEligibleSms('tsundoku', 'archived-post')).toBe(0)
  })

  it('rejects an invalid signature without touching the database', async () => {
    const response = await smsPost(
      smsRequest({ From: '+1', To: '+2', Body: 'x' }, 'invalid')
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
      expect.objectContaining({
        from: '+15551234567',
        to: '+12123473190',
        inboundMessageId: rows[0].id,
        conversationId: expect.any(String),
        userMessageId: expect.any(String),
        generationId: expect.any(String),
      }),
    ])
    const conversations = await db.select().from(bellConversations)
    const messages = await db.select().from(bellMessages)
    const generations = await db.select().from(bellGenerations)
    expect(conversations).toHaveLength(1)
    expect(conversations[0]).toMatchObject({
      surface: 'sms',
      smsPhoneHash: expect.any(String),
      expiresAt: null,
    })
    expect(conversations[0].smsPhoneHash).not.toContain('+15551234567')
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      role: 'user',
      authorKind: 'visitor',
      content: '',
      sourceTextMessageId: rows[0].id,
    })
    expect(generations).toHaveLength(1)
    expect(generations[0]).toMatchObject({
      userMessageId: messages[0].id,
      workflowRunId: 'wrun_sms',
    })
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
    expect(await db.select().from(bellConversations)).toHaveLength(1)
    expect(await db.select().from(bellMessages)).toHaveLength(1)
    expect(await db.select().from(bellGenerations)).toHaveLength(1)
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
    expect(xml).toContain('<Response></Response>')
    expect(xml).not.toContain(SMS_BELL_CONTACT_ONBOARDING)
    expect(xml).not.toContain('<Media>')

    const subscribers = await db.select().from(smsSubscribers)
    expect(subscribers).toHaveLength(1)
    expect(subscribers[0]).toMatchObject({
      phoneNumber: '+14155551234',
      subscribedPostcard: true,
      subscribedContraption: true,
      subscribedWorkshop: true,
      subscribedTsundoku: false,
      source: 'sms:phone',
    })
    expect(subscribers[0].confirmedAt).toBeInstanceOf(Date)
    await flushAfterTasks()
    expect(vi.mocked(sendSms)).toHaveBeenNthCalledWith(1, {
      from: '+12123473190',
      to: '+14155551234',
      body: SMS_SUBSCRIBE_CONFIRMATION,
    })
    expect(vi.mocked(sendSms)).toHaveBeenCalledWith({
      from: '+12123473190',
      to: '+14155551234',
      body: SMS_BELL_CONTACT_ONBOARDING,
      mediaUrl: 'https://www.philipithomas.com/bell.vcf',
    })
    const messages = await db.select().from(textMessages)
    expect(messages).toHaveLength(3)
    expect(messages).toContainEqual(
      expect.objectContaining({
        fromNumber: '+12123473190',
        toNumber: '+14155551234',
        body: SMS_SUBSCRIBE_CONFIRMATION,
        direction: 'outbound',
        twilioSid: 'SM_CONFIRM',
        status: 'queued',
      })
    )
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
    expect(start).toHaveBeenCalledWith(smsSignupOnboardingWorkflow, [
      {
        from: '+12123473190',
        to: '+14155551234',
        sendConfirmation: true,
      },
    ])
    expect(sleep).toHaveBeenCalledWith('3s')
  })

  it('releases the signup webhook lease when workflow enqueue fails', async () => {
    vi.mocked(start).mockRejectedValueOnce(new Error('workflow unavailable'))
    const form = {
      From: '+14155551234',
      To: '+12123473190',
      Body: 'SUBSCRIBE',
      MessageSid: 'SM_SUB_RETRY_ENQUEUE',
    }

    await expect(smsPost(smsRequest(form))).rejects.toThrow(
      'workflow unavailable'
    )
    const retry = await smsPost(smsRequest(form))

    expect(retry.status).toBe(200)
    expect(await retry.text()).toContain('<Response></Response>')
    expect(start).toHaveBeenCalledTimes(2)
    expect(vi.mocked(sendSms)).toHaveBeenCalledWith({
      from: '+12123473190',
      to: '+14155551234',
      body: SMS_BELL_CONTACT_ONBOARDING,
      mediaUrl: 'https://www.philipithomas.com/bell.vcf',
    })
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
    await db
      .update(smsSubscribers)
      .set({ subscribedTsundoku: true })
      .where(eq(smsSubscribers.phoneNumber, form.From))
    vi.mocked(sendSimpleEmail).mockClear()
    vi.mocked(sendSms).mockClear()

    const response = await smsPost(
      smsRequest({ ...form, MessageSid: 'SM_SUB_AGAIN' })
    )

    expect(response.status).toBe(200)
    const xml = await response.text()
    expect(xml).toContain('<Response></Response>')
    expect(xml).not.toContain(SMS_BELL_CONTACT_ONBOARDING)
    expect(xml).not.toContain('<Media>')
    await flushAfterTasks()
    expect(vi.mocked(sendSms)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendSms)).toHaveBeenCalledWith({
      from: '+12123473190',
      to: '+14155551234',
      body: SMS_SUBSCRIBE_CONFIRMATION,
    })
    expect(vi.mocked(sendSimpleEmail)).not.toHaveBeenCalled()
    const [subscriber] = await db.select().from(smsSubscribers)
    expect(subscriber.subscribedTsundoku).toBe(true)
  })

  it('retries the Bell card after Twilio rejects the first MMS', async () => {
    let rejectedFirstMms = false
    let localSmsCount = 0
    vi.mocked(sendSms).mockImplementation(async (input) => {
      if (input.mediaUrl && !rejectedFirstMms) {
        rejectedFirstMms = true
        throw new Error('MMS rejected')
      }
      if (input.mediaUrl) return { sid: 'MM_BELL_RETRY', status: 'queued' }
      localSmsCount += 1
      return { sid: `SM_LOCAL_${localSmsCount}`, status: 'queued' }
    })

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

    const mediaCalls = vi
      .mocked(sendSms)
      .mock.calls.filter(([input]) => Boolean(input.mediaUrl))
    expect(mediaCalls).toHaveLength(2)
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

    await deleteSmsDataForPhoneNumber(phoneNumber)
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

  it('deletes all local SMS data when a sender texts STOP', async () => {
    await smsPost(
      smsRequest({
        From: '+15551234567',
        To: '+12123473190',
        Body: 'SUBSCRIBE',
        MessageSid: 'SM_SUB',
      })
    )
    await flushAfterTasks()
    const [subscriberBeforeStop] = await db.select().from(smsSubscribers)
    await db.insert(smsSends).values({
      smsSubscriberId: subscriberBeforeStop.id,
      postSlug: 'pending-post',
      newsletter: 'postcard',
      body: 'new post',
      nextAttemptAt: new Date(),
    })
    await smsPost(
      smsRequest({
        From: '+15551234567',
        To: '+12123473190',
        Body: 'What is on the website?',
        MessageSid: 'SM_QUESTION',
      })
    )
    expect(await db.select().from(bellConversations)).toHaveLength(1)
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
    const xml = await response.text()
    expect(xml).toContain('You are unsubscribed')
    expect(xml).toContain('START or UNSTOP')
    expect(await db.select().from(smsSubscribers)).toHaveLength(0)
    expect(await db.select().from(smsSends)).toHaveLength(0)
    expect(await db.select().from(textMessages)).toHaveLength(0)
    expect(await db.select().from(bellConversations)).toHaveLength(0)
    expect(await db.select().from(bellMessages)).toHaveLength(0)
    expect(await db.select().from(bellGenerations)).toHaveLength(0)
    expect(vi.mocked(sendSimpleEmail)).not.toHaveBeenCalled()
    expect(start).toHaveBeenCalledWith(smsSignupOnboardingWorkflow, [
      {
        from: '+12123473190',
        to: '+15551234567',
        sendConfirmation: true,
      },
    ])
  })

  it('allows a fresh local subscription after STOP deletes the old state', async () => {
    const phoneNumber = '+15551234567'
    const stopResponse = await smsPost(
      smsRequest({
        From: phoneNumber,
        To: '+12123473190',
        Body: 'STOP',
        MessageSid: 'SM_STOP',
      })
    )
    expect(await stopResponse.text()).toContain('START or UNSTOP')
    expect(await db.select().from(smsSubscribers)).toHaveLength(0)
    vi.mocked(sendSms).mockClear()
    vi.mocked(sendSimpleEmail).mockClear()

    const form = {
      From: phoneNumber,
      To: '+12123473190',
      Body: 'SUBSCRIBE',
      MessageSid: 'SM_UNSAFE_RESUB',
    }
    const response = await smsPost(smsRequest(form))

    expect(response.status).toBe(200)
    await flushAfterTasks()
    const [subscriber] = await db.select().from(smsSubscribers)
    expect(subscriber.confirmedAt).toBeInstanceOf(Date)
    expect(subscriber.subscribedPostcard).toBe(true)
    expect(subscriber.subscribedContraption).toBe(true)
    expect(subscriber.subscribedWorkshop).toBe(true)
    expect(subscriber.subscribedTsundoku).toBe(false)
    expect(subscriber.bellContactCardSentAt).toBeInstanceOf(Date)
    expect(vi.mocked(sendSms)).toHaveBeenCalled()
    expect(vi.mocked(sendSimpleEmail)).toHaveBeenCalled()

    const duplicate = await smsPost(smsRequest(form))
    expect(await duplicate.text()).toContain('<Response></Response>')
  })

  it.each([
    'UNSTOP',
    'YES',
  ])('reactivates local state for Twilio keyword %s without OptOutType', async (keyword) => {
    const phoneNumber = '+15551234567'
    await smsPost(
      smsRequest({
        From: phoneNumber,
        To: '+12123473190',
        Body: 'SUBSCRIBE',
        MessageSid: 'SM_SUB',
      })
    )
    await flushAfterTasks()
    await smsPost(
      smsRequest({
        From: phoneNumber,
        To: '+12123473190',
        Body: 'STOP',
        MessageSid: 'SM_STOP',
      })
    )
    vi.mocked(sendSms).mockClear()

    const response = await smsPost(
      smsRequest({
        From: phoneNumber,
        To: '+12123473190',
        Body: keyword,
        MessageSid: `SM_${keyword}`,
      })
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<Response></Response>')
    await flushAfterTasks()
    const [subscriber] = await db.select().from(smsSubscribers)
    expect(subscriber.confirmedAt).toBeInstanceOf(Date)
    expect(subscriber.subscribedPostcard).toBe(true)
    expect(vi.mocked(sendSms)).toHaveBeenCalledWith({
      from: '+12123473190',
      to: phoneNumber,
      body: SMS_BELL_CONTACT_ONBOARDING,
      mediaUrl: 'https://www.philipithomas.com/bell.vcf',
    })
    expect(start).toHaveBeenCalledWith(smsSignupOnboardingWorkflow, [
      {
        from: '+12123473190',
        to: phoneNumber,
        sendConfirmation: true,
      },
    ])
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
    expect(await db.select().from(smsSubscribers)).toHaveLength(0)
    expect(vi.mocked(sendSimpleEmail)).not.toHaveBeenCalled()
    expect(await db.select().from(textMessages)).toHaveLength(0)

    const resubscribe = await smsPost(
      smsRequest({
        ...subscribeForm,
        Body: 'START',
        MessageSid: 'SM_RESUB',
      })
    )
    expect(await resubscribe.text()).toContain('<Response></Response>')
    await flushAfterTasks()
    vi.mocked(sendSimpleEmail).mockClear()

    const duplicateStop = await smsPost(smsRequest(stopForm))
    expect(await duplicateStop.text()).toContain('<Response></Response>')
    const [subscriberAfterDuplicateStop] = await db
      .select()
      .from(smsSubscribers)
    expect(subscriberAfterDuplicateStop.confirmedAt).toBeInstanceOf(Date)
    expect(vi.mocked(sendSimpleEmail)).not.toHaveBeenCalled()
    expect(await db.select().from(textMessages)).toHaveLength(3)
  })

  it('deletes pending SMS send rows when a number sends STOP', async () => {
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

    expect(await db.select().from(smsSends)).toHaveLength(0)
    expect(await resetFailedSmsBySlug('post-a')).toBe(0)
    expect(await resetFailedSmsBySlug('post-b')).toBe(0)
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
    expect(await db.select().from(smsSubscribers)).toHaveLength(0)
    expect(await db.select().from(textMessages)).toHaveLength(0)
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

  it('reactivates stopped state from authoritative Twilio START metadata', async () => {
    const phoneNumber = '+15551234567'
    await smsPost(
      smsRequest({
        From: phoneNumber,
        To: '+12123473190',
        Body: 'SUBSCRIBE',
        MessageSid: 'SM_SUB',
      })
    )
    await flushAfterTasks()
    await smsPost(
      smsRequest({
        From: phoneNumber,
        To: '+12123473190',
        Body: 'STOP',
        MessageSid: 'SM_STOP',
      })
    )
    vi.mocked(sendSms).mockClear()

    const response = await smsPost(
      smsRequest({
        From: phoneNumber,
        To: '+12123473190',
        Body: 'CUSTOM-OPT-IN',
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
      to: phoneNumber,
      body: SMS_BELL_CONTACT_ONBOARDING,
      mediaUrl: 'https://www.philipithomas.com/bell.vcf',
    })
    expect(await db.select().from(textMessages)).toContainEqual(
      expect.objectContaining({
        body: SMS_BELL_CONTACT_ONBOARDING,
        direction: 'outbound',
        twilioSid: expect.stringMatching(/^MM_BELL/),
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
    const body = fixedBellSmsBody('Too many messages. Please try again later.')
    expect(await response.text()).toContain(body)
    expect(checkRateLimit).toHaveBeenCalledWith(
      'chat',
      'phone:+15551234567',
      expect.any(Request)
    )
    expect(start).not.toHaveBeenCalled()
    const rows = await db.select().from(textMessages)
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({
      body,
      direction: 'outbound',
      status: 'queued',
      replyToMessageId: rows[0].id,
    })
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
    expect(xml).toContain('Text STOP to unsubscribe or HELP for help')
    const subscribers = await db.select().from(smsSubscribers)
    expect(subscribers).toHaveLength(1)
    expect(subscribers[0]).toMatchObject({
      phoneNumber: '+14155551234',
      subscribedPostcard: true,
      subscribedContraption: true,
      subscribedWorkshop: true,
      subscribedTsundoku: false,
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

  it('does not recreate deleted data for a duplicate voice-menu CallSid', async () => {
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
    expect(await db.select().from(smsSubscribers)).toHaveLength(0)
  })

  it('allows a fresh voice signup after STOP deletes the old state', async () => {
    const phoneNumber = '+14155551234'
    await smsPost(
      smsRequest({
        From: phoneNumber,
        To: '+12123473190',
        Body: 'STOP',
        MessageSid: 'SM_STOP',
      })
    )
    vi.mocked(sendSms).mockClear()
    vi.mocked(sendSimpleEmail).mockClear()

    const voiceForm = {
      From: phoneNumber,
      To: '+12123473190',
      Digits: '2',
      CallSid: 'CA_RESUB',
    }
    const response = await voiceMenuPost(voiceMenuRequest(voiceForm))

    expect(response.status).toBe(200)
    const xml = await response.text()
    expect(xml).toContain('You are subscribed')
    await flushAfterTasks()
    const [subscriber] = await db.select().from(smsSubscribers)
    expect(subscriber.confirmedAt).toBeInstanceOf(Date)
    expect(subscriber.subscribedPostcard).toBe(true)
    expect(subscriber.bellContactCardSentAt).toBeInstanceOf(Date)
    expect(vi.mocked(sendSms)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(sendSimpleEmail)).toHaveBeenCalled()

    const duplicate = await voiceMenuPost(voiceMenuRequest(voiceForm))
    expect(await duplicate.text()).toContain('already handled')
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
    let localSmsCount = 0
    vi.mocked(sendSms).mockImplementation(async (input) => {
      if (input.mediaUrl) throw new Error('MMS rejected')
      localSmsCount += 1
      return {
        sid: localSmsCount === 1 ? 'SM_CONFIRM' : 'SM_FALLBACK',
        status: 'queued',
      }
    })

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
    expect(vi.mocked(sendSms)).toHaveBeenCalledTimes(3)
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
        expect.objectContaining({
          body: expect.stringContaining('/bell.vcf'),
          twilioSid: 'SM_FALLBACK',
          status: 'queued',
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
