import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Post } from '@/lib/content/types'
import type { EmailSend } from '@/lib/db/schema'

// Without the Workflow compiler the 'use workflow'/'use step' directives are
// no-ops, so the workflow runs as a plain async function. getStepMetadata
// throws outside the runtime, so stub it; keep the real error classes.
vi.mock('workflow', async (importActual) => {
  const actual = await importActual<typeof import('workflow')>()
  return {
    ...actual,
    getStepMetadata: vi.fn(),
  }
})

vi.mock('@/lib/content/loader-without-images', () => ({
  getPostBySlugWithoutImages: vi.fn(),
}))

vi.mock('@/lib/db/queries/email-sends', () => ({
  bulkCreateQueued: vi.fn(),
  findSendableByIds: vi.fn(),
  markPermanentFailure: vi.fn(),
  markSent: vi.fn(),
  pendingRowIdsBySlug: vi.fn(),
}))

vi.mock('@/lib/db/queries/sms-sends', () => ({
  bulkCreateQueuedSms: vi.fn(),
  findSendableSmsByIds: vi.fn(),
  markSmsPermanentFailure: vi.fn(),
  markSmsSent: vi.fn(),
  pendingSmsRowIdsBySlug: vi.fn(),
}))

vi.mock('@/lib/db/queries/subscribers', async (importActual) => {
  const actual =
    await importActual<typeof import('@/lib/db/queries/subscribers')>()
  return {
    ...actual, // keeps the real isNewsletter
    findEligibleIds: vi.fn(),
  }
})

vi.mock('@/lib/db/queries/sms-subscribers', () => ({
  findEligibleSmsIds: vi.fn(),
}))

vi.mock('@/lib/db/queries/suppressions', () => ({
  isSuppressed: vi.fn(),
}))

vi.mock('@/lib/db/queries/text-messages', () => ({
  createTextMessage: vi.fn(),
}))

vi.mock('@/lib/email/render-body', () => ({
  buildEmailBodyHtml: vi.fn(),
}))

vi.mock('@/lib/email/queued-send', () => ({
  sendQueuedEmail: vi.fn(),
}))

vi.mock('@/lib/phone/twilio', () => ({
  sendSms: vi.fn(),
}))

import { getStepMetadata, RetryableError } from 'workflow'
import { getPostBySlugWithoutImages } from '@/lib/content/loader-without-images'
import * as emailSends from '@/lib/db/queries/email-sends'
import * as smsSends from '@/lib/db/queries/sms-sends'
import { findEligibleSmsIds } from '@/lib/db/queries/sms-subscribers'
import { findEligibleIds } from '@/lib/db/queries/subscribers'
import { isSuppressed } from '@/lib/db/queries/suppressions'
import { createTextMessage } from '@/lib/db/queries/text-messages'
import { sendQueuedEmail } from '@/lib/email/queued-send'
import { buildEmailBodyHtml } from '@/lib/email/render-body'
import { sendSms } from '@/lib/phone/twilio'
import { sendNewsletterWorkflow } from '@/workflows/send-newsletter'

const mockedSends = vi.mocked(emailSends)
const mockedSmsSends = vi.mocked(smsSends)
const mockedGetPost = vi.mocked(getPostBySlugWithoutImages)
const mockedEligible = vi.mocked(findEligibleIds)
const mockedSmsEligible = vi.mocked(findEligibleSmsIds)
const mockedSuppressed = vi.mocked(isSuppressed)
const mockedBuildBody = vi.mocked(buildEmailBodyHtml)
const mockedSendQueued = vi.mocked(sendQueuedEmail)
const mockedSendSms = vi.mocked(sendSms)
const mockedCreateTextMessage = vi.mocked(createTextMessage)
const mockedStepMetadata = vi.mocked(getStepMetadata)

const POST = {
  slug: 'hello-world',
  newsletter: 'contraption',
  frontmatter: { title: 'Hello world', publishedAt: '2026-06-09' },
  content: '',
  excerpt: '',
} as Post

const BODY = {
  subject: 'Hello',
  subtitle: null,
  html: '<p>hi</p>',
  previewText: 'preview',
  bodyText: 'hi',
}

function stepMeta(attempt: number) {
  return {
    stepName: 'sendBatch',
    stepId: `step-${attempt}`,
    stepStartedAt: new Date(),
    attempt,
  }
}

function claimed(
  id: number,
  email = `user${id}@example.com`
): { send: EmailSend; email: string } {
  return {
    send: {
      id,
      subscriberId: id,
      postSlug: 'hello-world',
      newsletter: 'contraption',
      subject: BODY.subject,
      htmlContent: BODY.html,
      textContent: BODY.bodyText,
      previewText: BODY.previewText,
      unsubscribeToken: `tok-${id}`,
      sendError: null,
      sentAt: null,
      attempts: 0,
      nextAttemptAt: null,
      triggeredUnsubscribeAt: null,
      createdAt: new Date(),
    },
    email,
  }
}

function claimedSms(id: number, phoneNumber = `+1555123000${id}`) {
  return {
    send: {
      id,
      smsSubscriberId: id,
      postSlug: 'hello-world',
      newsletter: 'contraption',
      body: 'Contraption: Hello world\nhttps://www.philipithomas.com/hello-world\n\nReply STOP to unsubscribe.',
      twilioSid: null,
      twilioStatus: null,
      sendError: null,
      sentAt: null,
      attempts: 0,
      nextAttemptAt: null,
      createdAt: new Date(),
    },
    phoneNumber,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Fake timers absorb the per-send pacing sleep so tests stay instant.
  vi.useFakeTimers()
  mockedGetPost.mockReturnValue(POST)
  mockedBuildBody.mockResolvedValue(BODY)
  mockedSuppressed.mockResolvedValue(false)
  mockedStepMetadata.mockReturnValue(stepMeta(0))
  mockedSendQueued.mockResolvedValue(undefined)
  mockedSends.bulkCreateQueued.mockResolvedValue([])
  mockedSends.markSent.mockResolvedValue(undefined)
  mockedSends.markPermanentFailure.mockResolvedValue(undefined)
  mockedSends.findSendableByIds.mockImplementation(async (ids) =>
    ids.map((id) => claimed(id))
  )
  mockedSmsEligible.mockResolvedValue([])
  mockedSmsSends.bulkCreateQueuedSms.mockResolvedValue([])
  mockedSmsSends.pendingSmsRowIdsBySlug.mockResolvedValue([])
  mockedSmsSends.markSmsSent.mockResolvedValue(undefined)
  mockedSmsSends.markSmsPermanentFailure.mockResolvedValue(undefined)
  mockedSmsSends.findSendableSmsByIds.mockImplementation(async (ids) =>
    ids.map((id) => claimedSms(id))
  )
  mockedSendSms.mockResolvedValue({ sid: 'SM_test', status: 'queued' })
  mockedCreateTextMessage.mockResolvedValue({} as never)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('sendNewsletterWorkflow', () => {
  it('enqueues eligible recipients and sends every pending row in 50-row batches', async () => {
    const eligible = Array.from({ length: 51 }, (_, i) => i + 1)
    const pending = Array.from({ length: 51 }, (_, i) => i + 101)
    mockedEligible.mockResolvedValue(eligible)
    mockedSends.bulkCreateQueued.mockResolvedValue(pending)
    mockedSends.pendingRowIdsBySlug.mockResolvedValue(pending)

    const promise = sendNewsletterWorkflow('hello-world')
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual({
      batches: 2,
      sent: 51,
      failed: 0,
      smsBatches: 0,
      smsSent: 0,
      smsFailed: 0,
    })
    expect(mockedSends.bulkCreateQueued).toHaveBeenCalledWith({
      subscriberIds: eligible,
      postSlug: 'hello-world',
      newsletter: 'contraption',
      subject: 'Hello',
      htmlContent: '<p>hi</p>',
      textContent: 'hi',
      previewText: 'preview',
    })
    expect(mockedSends.findSendableByIds).toHaveBeenNthCalledWith(
      1,
      pending.slice(0, 50)
    )
    expect(mockedSends.findSendableByIds).toHaveBeenNthCalledWith(
      2,
      pending.slice(50)
    )
    expect(mockedSends.markSent).toHaveBeenCalledTimes(51)
    expect(mockedSends.markPermanentFailure).not.toHaveBeenCalled()
  })

  it('marks suppressed recipients and permanent SES errors failed and keeps sending the batch', async () => {
    // Resume path: nothing newly eligible, rows already queued from a prior run.
    mockedEligible.mockResolvedValue([])
    mockedSends.pendingRowIdsBySlug.mockResolvedValue([1, 2, 3])
    mockedSends.findSendableByIds.mockResolvedValue([
      claimed(1, 'suppressed@example.com'),
      claimed(2, 'rejected@example.com'),
      claimed(3, 'ok@example.com'),
    ])
    mockedSuppressed.mockImplementation(
      async (email) => email === 'suppressed@example.com'
    )
    mockedSendQueued.mockImplementation(async ({ email }) => {
      if (email === 'rejected@example.com') {
        throw Object.assign(new Error('Email address is not verified.'), {
          name: 'MessageRejected',
        })
      }
    })

    const promise = sendNewsletterWorkflow('hello-world')
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual({
      batches: 1,
      sent: 1,
      failed: 2,
      smsBatches: 0,
      smsSent: 0,
      smsFailed: 0,
    })
    expect(mockedSends.bulkCreateQueued).not.toHaveBeenCalled()
    expect(mockedSends.markPermanentFailure).toHaveBeenCalledTimes(2)
    expect(mockedSends.markPermanentFailure).toHaveBeenCalledWith(
      1,
      'Recipient is suppressed'
    )
    expect(mockedSends.markPermanentFailure).toHaveBeenCalledWith(
      2,
      'Email address is not verified.'
    )
    // The suppressed recipient is never handed to SES.
    expect(mockedSendQueued).not.toHaveBeenCalledWith(
      expect.objectContaining({ email: 'suppressed@example.com' })
    )
    expect(mockedSendQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ok@example.com',
        unsubscribeToken: 'tok-3',
      })
    )
    expect(mockedSends.markSent).toHaveBeenCalledTimes(1)
    expect(mockedSends.markSent).toHaveBeenCalledWith(3)
  })

  it('throws RetryableError with exponential backoff on a transient SES error', async () => {
    const now = new Date('2026-06-09T12:00:00Z')
    vi.setSystemTime(now)
    mockedEligible.mockResolvedValue([])
    mockedSends.pendingRowIdsBySlug.mockResolvedValue([1])
    mockedSendQueued.mockRejectedValue(
      Object.assign(new Error('Too many requests'), {
        name: 'TooManyRequestsException',
      })
    )
    mockedStepMetadata.mockReturnValue(stepMeta(2))

    const err = await sendNewsletterWorkflow('hello-world').catch((e) => e)

    expect(err).toBeInstanceOf(RetryableError)
    expect(err.message).toBe('Too many requests')
    // 2^2 * 1000 ms from now
    expect(err.retryAfter).toEqual(new Date(now.getTime() + 4_000))
    expect(mockedSends.markPermanentFailure).not.toHaveBeenCalled()
    expect(mockedSends.markSent).not.toHaveBeenCalled()
  })

  it('caps the transient-error backoff at 60 seconds', async () => {
    const now = new Date('2026-06-09T12:00:00Z')
    vi.setSystemTime(now)
    mockedEligible.mockResolvedValue([])
    mockedSends.pendingRowIdsBySlug.mockResolvedValue([1])
    mockedSendQueued.mockRejectedValue(
      Object.assign(new Error('Too many requests'), {
        name: 'TooManyRequestsException',
      })
    )
    // 2^6 * 1000 = 64s, above the 60s cap
    mockedStepMetadata.mockReturnValue(stepMeta(6))

    const err = await sendNewsletterWorkflow('hello-world').catch((e) => e)

    expect(err).toBeInstanceOf(RetryableError)
    expect(err.retryAfter).toEqual(new Date(now.getTime() + 60_000))
  })

  it('enqueues and sends SMS subscribers after the email batches', async () => {
    mockedEligible.mockResolvedValue([])
    mockedSends.pendingRowIdsBySlug.mockResolvedValue([])
    mockedSmsEligible.mockResolvedValue([7])
    mockedSmsSends.bulkCreateQueuedSms.mockResolvedValue([701])
    mockedSmsSends.pendingSmsRowIdsBySlug.mockResolvedValue([701])
    mockedSmsSends.findSendableSmsByIds.mockResolvedValue([
      claimedSms(701, '+15551234567'),
    ])

    const promise = sendNewsletterWorkflow('hello-world')
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual({
      batches: 0,
      sent: 0,
      failed: 0,
      smsBatches: 1,
      smsSent: 1,
      smsFailed: 0,
    })
    expect(mockedSmsSends.bulkCreateQueuedSms).toHaveBeenCalledWith({
      smsSubscriberIds: [7],
      postSlug: 'hello-world',
      newsletter: 'contraption',
      body: expect.stringContaining('Contraption: Hello world'),
    })
    expect(mockedSendSms).toHaveBeenCalledWith({
      from: '+12123473190',
      to: '+15551234567',
      body: expect.stringContaining('Reply STOP to unsubscribe.'),
    })
    expect(mockedSmsSends.markSmsSent).toHaveBeenCalledWith({
      id: 701,
      twilioSid: 'SM_test',
      twilioStatus: 'queued',
    })
    expect(mockedCreateTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        fromNumber: '+12123473190',
        toNumber: '+15551234567',
        direction: 'outbound',
        twilioSid: 'SM_test',
      })
    )
  })
})
