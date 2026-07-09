import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Post } from '@/lib/content/types'

// Real PGlite database with the real migrations applied; all of
// @/lib/db/queries/* runs real SQL against it.
vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

// Without the Workflow compiler the 'use workflow'/'use step' directives are
// no-ops, so the workflow and its steps run as plain async functions.
// getStepMetadata throws outside the runtime, so stub it; keep the real error
// classes.
vi.mock('workflow', async (importActual) => {
  const actual = await importActual<typeof import('workflow')>()
  return {
    ...actual,
    getStepMetadata: vi.fn(() => ({
      stepName: 'sendBatch',
      stepId: 'step-0',
      stepStartedAt: new Date(),
      attempt: 0,
    })),
  }
})

// The content loader reads MDX from disk; pin a synthetic post instead.
vi.mock('@/lib/content/loader-without-images', () => ({
  getPostBySlugWithoutImages: vi.fn(),
}))

// Rendering pulls in related-posts artifacts; pin a synthetic body instead.
vi.mock('@/lib/email/render-body', () => ({
  buildEmailBodyHtml: vi.fn(),
}))

// Cut at the SES module boundary (the harness seam): sendQueuedEmail and the
// shell rendering stay real, so per-recipient unsubscribe URLs — the inputs
// ses.ts folds into the List-Unsubscribe headers — are built by production
// code and inspected on the mock.
vi.mock('@/lib/email/ses', () =>
  import('@/test/integration/mocks').then((m) => m.sesMock())
)

import { FatalError, RetryableError } from 'workflow'
import { siteConfig } from '@/lib/config'
import { getPostBySlugWithoutImages } from '@/lib/content/loader-without-images'
import {
  markSent,
  pendingRowIdsBySlug,
  resetFailedBySlug,
} from '@/lib/db/queries/email-sends'
import {
  bulkCreateQueuedSms,
  claimSendableSmsById,
  markSmsPermanentFailure,
  pendingSmsRowIdsBySlug,
  resetFailedSmsBySlug,
  SMS_SEND_SKIPPED_UNSUBSCRIBED,
} from '@/lib/db/queries/sms-sends'
import { unsubscribeSmsNumber } from '@/lib/db/queries/sms-subscribers'
import {
  type EmailSend,
  emailSends,
  emailSuppressions,
  type SmsSend,
  smsSends,
  smsSubscribers,
  subscribers,
  textMessages,
} from '@/lib/db/schema'
import { buildEmailBodyHtml } from '@/lib/email/render-body'
import { sendNewsletterEmail } from '@/lib/email/ses'
import { db, resetDb } from '@/test/integration/db'
import {
  enqueueRecipients,
  sendBatch,
  sendNewsletterWorkflow,
  sendSmsBatch,
} from '@/workflows/send-newsletter'

const mockedGetPost = vi.mocked(getPostBySlugWithoutImages)
const mockedBuildBody = vi.mocked(buildEmailBodyHtml)
const mockedSes = vi.mocked(sendNewsletterEmail)

const SLUG = 'hello-world'
const POST = {
  slug: SLUG,
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

async function seedSubscriber(input: {
  email: string
  confirmed?: boolean
  contraption?: boolean
}) {
  const [row] = await db
    .insert(subscribers)
    .values({
      email: input.email,
      confirmedAt: input.confirmed === false ? null : new Date(),
      subscribedContraption: input.contraption ?? true,
    })
    .returning()
  return row
}

async function seedSmsSubscriber(input: {
  phoneNumber: string
  confirmed?: boolean
  contraption?: boolean
}) {
  const [row] = await db
    .insert(smsSubscribers)
    .values({
      phoneNumber: input.phoneNumber,
      confirmedAt: input.confirmed === false ? null : new Date(),
      subscribedContraption: input.contraption ?? true,
    })
    .returning()
  return row
}

/** Direct insert of a pre-existing email_sends row (leftover from a prior run). */
async function seedSendRow(
  subscriberId: number,
  overrides: Partial<typeof emailSends.$inferInsert> = {}
) {
  const [row] = await db
    .insert(emailSends)
    .values({ subscriberId, postSlug: SLUG, ...overrides })
    .returning()
  return row
}

function allRows() {
  return db.select().from(emailSends).orderBy(emailSends.id)
}

function allSmsRows() {
  return db.select().from(smsSends).orderBy(smsSends.id)
}

function rowFor(rows: EmailSend[], subscriberId: number): EmailSend {
  const row = rows.find((r) => r.subscriberId === subscriberId)
  if (!row) throw new Error(`no email_sends row for subscriber ${subscriberId}`)
  return row
}

function smsRowFor(rows: SmsSend[], subscriberId: number): SmsSend {
  const row = rows.find((r) => r.smsSubscriberId === subscriberId)
  if (!row) throw new Error(`no sms_sends row for subscriber ${subscriberId}`)
  return row
}

function workflowResult(input: {
  batches: number
  sent: number
  failed: number
  smsBatches?: number
  smsSent?: number
  smsFailed?: number
}) {
  return {
    smsBatches: 0,
    smsSent: 0,
    smsFailed: 0,
    ...input,
  }
}

/** SESv2 SDK errors carry the exception name; isPermanentSesError matches on it. */
function sesError(name: string, message: string) {
  return Object.assign(new Error(message), { name })
}

beforeEach(async () => {
  await resetDb()
  process.env.PHONE_NUMBER = '+12123473190'
  process.env.TWILIO_SID = 'AC_test'
  process.env.TWILIO_SECRET = 'token_test'
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ sid: 'SM_test', status: 'queued' }), {
          status: 201,
        })
    )
  )
  mockedSes.mockReset()
  mockedSes.mockResolvedValue(undefined)
  mockedGetPost.mockReset()
  mockedGetPost.mockReturnValue(POST)
  mockedBuildBody.mockReset()
  mockedBuildBody.mockResolvedValue(BODY)
})

afterEach(() => {
  delete process.env.PHONE_NUMBER
  delete process.env.TWILIO_SID
  delete process.env.TWILIO_SECRET
  vi.unstubAllGlobals()
})

// Real timers throughout: the send step paces SEND_SPACING_MS (80ms) per
// recipient, so keep seeds tiny (a few recipients per test).
describe('enqueueRecipients (step)', () => {
  it('enqueues exactly the eligible set and snapshots the rendered content', async () => {
    const alice = await seedSubscriber({ email: 'alice@example.com' })
    const bob = await seedSubscriber({ email: 'bob@example.com' })
    await seedSubscriber({ email: 'unconfirmed@example.com', confirmed: false })
    await seedSubscriber({ email: 'optout@example.com', contraption: false })
    // Leftovers from a prior run: carol already received the post, dave is
    // still queued. Neither may be enqueued again.
    const carol = await seedSubscriber({ email: 'carol@example.com' })
    const sentRow = await seedSendRow(carol.id, { sentAt: new Date() })
    const dave = await seedSubscriber({ email: 'dave@example.com' })
    const pendingRow = await seedSendRow(dave.id)

    const chunks = await enqueueRecipients(SLUG)

    const rows = await allRows()
    expect(rows).toHaveLength(4)
    const created = rows.filter(
      (r) => r.id !== sentRow.id && r.id !== pendingRow.id
    )
    expect(created.map((r) => r.subscriberId).sort((a, b) => a - b)).toEqual([
      alice.id,
      bob.id,
    ])
    for (const row of created) {
      expect(row.postSlug).toBe(SLUG)
      expect(row.newsletter).toBe('contraption')
      expect(row.subject).toBe(BODY.subject)
      expect(row.htmlContent).toBe(BODY.html)
      expect(row.textContent).toBe(BODY.bodyText)
      expect(row.previewText).toBe(BODY.previewText)
      expect(row.sentAt).toBeNull()
      expect(row.sendError).toBeNull()
    }

    // The returned batches resume dave's stalled row and exclude carol's
    // delivered one; enqueue itself sends nothing.
    const batchIds = chunks.flat().sort((a, b) => a - b)
    expect(batchIds).toEqual(
      [pendingRow.id, ...created.map((r) => r.id)].sort((a, b) => a - b)
    )
    expect(mockedSes).not.toHaveBeenCalled()
  })

  it('re-running enqueue creates no duplicate rows and returns the same batch', async () => {
    await seedSubscriber({ email: 'alice@example.com' })
    await seedSubscriber({ email: 'bob@example.com' })

    const first = await enqueueRecipients(SLUG)
    const rowsAfterFirst = await allRows()
    expect(rowsAfterFirst).toHaveLength(2)

    const second = await enqueueRecipients(SLUG)

    const rowsAfterSecond = await allRows()
    expect(rowsAfterSecond.map((r) => r.id)).toEqual(
      rowsAfterFirst.map((r) => r.id)
    )
    expect(second.flat()).toEqual(first.flat())
  })

  it('rejects an unknown or non-newsletter post without enqueueing', async () => {
    await seedSubscriber({ email: 'alice@example.com' })

    mockedGetPost.mockReturnValue(null)
    await expect(enqueueRecipients('missing')).rejects.toBeInstanceOf(
      FatalError
    )

    mockedGetPost.mockReturnValue({
      slug: SLUG,
      newsletter: 'essay',
    } as unknown as Post)
    await expect(enqueueRecipients(SLUG)).rejects.toBeInstanceOf(FatalError)

    expect(await allRows()).toHaveLength(0)
  })
})

describe('sendBatch (step)', () => {
  it('a replayed batch skips rows already marked sent (at-least-once edge)', async () => {
    const alice = await seedSubscriber({ email: 'alice@example.com' })
    const bob = await seedSubscriber({ email: 'bob@example.com' })
    const [batch] = await enqueueRecipients(SLUG)
    expect(batch).toHaveLength(2)

    // Crash simulation: the first attempt marked alice sent, then died before
    // finishing. The runtime replays sendBatch with the SAME row ids.
    const aliceRow = rowFor(await allRows(), alice.id)
    await markSent(aliceRow.id)
    const sentAtBefore = rowFor(await allRows(), alice.id).sentAt

    const result = await sendBatch(batch)

    expect(result).toEqual({ sent: 1, failed: 0 })
    expect(mockedSes).toHaveBeenCalledTimes(1)
    expect(mockedSes).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'bob@example.com' })
    )
    const after = await allRows()
    expect(rowFor(after, alice.id).sentAt).toEqual(sentAtBefore)
    expect(rowFor(after, bob.id).sentAt).not.toBeNull()
  })
})

describe('sendNewsletterWorkflow', () => {
  it('marks every row sent and hands SES per-recipient unsubscribe URLs', async () => {
    const alice = await seedSubscriber({ email: 'alice@example.com' })
    const bob = await seedSubscriber({ email: 'bob@example.com' })

    const result = await sendNewsletterWorkflow(SLUG)

    expect(result).toEqual(workflowResult({ batches: 1, sent: 2, failed: 0 }))
    const rows = await allRows()
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.sentAt).not.toBeNull()
      expect(row.sendError).toBeNull()
    }

    const aliceRow = rowFor(rows, alice.id)
    const bobRow = rowFor(rows, bob.id)
    expect(aliceRow.unsubscribeToken).not.toBe(bobRow.unsubscribeToken)

    // These URL arguments are exactly what ses.ts folds into the
    // List-Unsubscribe / List-Unsubscribe-Post headers (RFC 2369 + 8058).
    expect(mockedSes).toHaveBeenCalledTimes(2)
    for (const [email, row] of [
      ['alice@example.com', aliceRow],
      ['bob@example.com', bobRow],
    ] as const) {
      expect(mockedSes).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          subject: BODY.subject,
          text: BODY.bodyText,
          previewText: BODY.previewText,
          unsubscribeUrl: `${siteConfig.url}/unsubscribe?token=${row.unsubscribeToken}`,
          unsubscribePostUrl: `${siteConfig.url}/api/unsubscribe/${row.unsubscribeToken}`,
        })
      )
    }

    // The HTML is the full shell wrapping the snapshotted body, with the
    // recipient's own unsubscribe link in the footer.
    const aliceCall = mockedSes.mock.calls.find(
      ([input]) => input.to === 'alice@example.com'
    )?.[0]
    expect(aliceCall?.html).toContain(BODY.html)
    expect(aliceCall?.html).toContain(aliceRow.unsubscribeToken)
  })

  it('a completed send re-runs as a no-op: no new rows, nothing re-sent', async () => {
    await seedSubscriber({ email: 'alice@example.com' })
    await seedSubscriber({ email: 'bob@example.com' })

    const first = await sendNewsletterWorkflow(SLUG)
    expect(first).toEqual(workflowResult({ batches: 1, sent: 2, failed: 0 }))
    const rowsAfterFirst = await allRows()
    mockedSes.mockClear()

    const second = await sendNewsletterWorkflow(SLUG)

    expect(second).toEqual(workflowResult({ batches: 0, sent: 0, failed: 0 }))
    const rowsAfterSecond = await allRows()
    expect(rowsAfterSecond.map((r) => r.id)).toEqual(
      rowsAfterFirst.map((r) => r.id)
    )
    expect(mockedSes).not.toHaveBeenCalled()
  })

  it('a permanent SES rejection fails only that row; the rest still sends', async () => {
    const alice = await seedSubscriber({ email: 'alice@example.com' })
    const bob = await seedSubscriber({ email: 'bob@example.com' })
    mockedSes.mockImplementation(async ({ to }) => {
      if (to === 'bob@example.com') {
        throw sesError('MessageRejected', 'Email address is not verified.')
      }
    })

    const result = await sendNewsletterWorkflow(SLUG)

    expect(result).toEqual(workflowResult({ batches: 1, sent: 1, failed: 1 }))
    const rows = await allRows()
    const aliceRow = rowFor(rows, alice.id)
    expect(aliceRow.sentAt).not.toBeNull()
    expect(aliceRow.sendError).toBeNull()
    const bobRow = rowFor(rows, bob.id)
    expect(bobRow.sentAt).toBeNull()
    expect(bobRow.sendError).toBe('Email address is not verified.')
    expect(bobRow.attempts).toBe(1)
    // The failed row leaves the queue until an admin retries it.
    expect(await pendingRowIdsBySlug(SLUG)).toEqual([])
  })

  it('a transient SES error raises RetryableError and leaves the row sendable', async () => {
    const bob = await seedSubscriber({ email: 'bob@example.com' })
    mockedSes.mockRejectedValue(
      sesError('TooManyRequestsException', 'Too many requests')
    )

    const err = await sendNewsletterWorkflow(SLUG).catch((e) => e)

    expect(err).toBeInstanceOf(RetryableError)
    expect(err.message).toBe('Too many requests')
    // The runtime would retry the step (up to maxRetries); the row stays
    // sendable in the meantime — no sent_at, no send_error.
    expect(sendBatch.maxRetries).toBe(6)
    const bobRow = rowFor(await allRows(), bob.id)
    expect(bobRow.sentAt).toBeNull()
    expect(bobRow.sendError).toBeNull()
    expect(await pendingRowIdsBySlug(SLUG)).toEqual([bobRow.id])

    // Once the throttle clears, a re-run resumes the same row. No duplicate.
    mockedSes.mockReset()
    mockedSes.mockResolvedValue(undefined)
    const result = await sendNewsletterWorkflow(SLUG)
    expect(result).toEqual(workflowResult({ batches: 1, sent: 1, failed: 0 }))
    const healed = await allRows()
    expect(healed.map((r) => r.id)).toEqual([bobRow.id])
    expect(healed[0].sentAt).not.toBeNull()
  })

  it('a suppressed recipient fails with the suppression reason and never reaches SES', async () => {
    const alice = await seedSubscriber({ email: 'alice@example.com' })
    const bob = await seedSubscriber({ email: 'bob@example.com' })
    await db.insert(emailSuppressions).values({
      email: 'bob@example.com',
      reason: 'BOUNCE',
      source: 'ses_account',
    })

    const result = await sendNewsletterWorkflow(SLUG)

    expect(result).toEqual(workflowResult({ batches: 1, sent: 1, failed: 1 }))
    const rows = await allRows()
    const bobRow = rowFor(rows, bob.id)
    expect(bobRow.sentAt).toBeNull()
    expect(bobRow.sendError).toBe('Recipient is suppressed')
    expect(rowFor(rows, alice.id).sentAt).not.toBeNull()
    expect(mockedSes).toHaveBeenCalledTimes(1)
    expect(mockedSes).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: 'bob@example.com' })
    )
  })

  it('resetFailedBySlug heals a failed row and a re-send reuses it; sent rows stay untouched', async () => {
    const alice = await seedSubscriber({ email: 'alice@example.com' })
    const bob = await seedSubscriber({ email: 'bob@example.com' })
    mockedSes.mockImplementation(async ({ to }) => {
      if (to === 'bob@example.com') {
        throw sesError('MessageRejected', 'Email address is not verified.')
      }
    })

    const first = await sendNewsletterWorkflow(SLUG)
    expect(first).toEqual(workflowResult({ batches: 1, sent: 1, failed: 1 }))

    const rows = await allRows()
    expect(rows).toHaveLength(2)
    const aliceRow = rowFor(rows, alice.id)
    const bobRow = rowFor(rows, bob.id)
    expect(aliceRow.sentAt).not.toBeNull()
    expect(bobRow.sentAt).toBeNull()
    expect(bobRow.sendError).toBe('Email address is not verified.')

    // Heal exactly as the send and retry routes do, then re-run the workflow.
    mockedSes.mockReset()
    mockedSes.mockResolvedValue(undefined)
    expect(await resetFailedBySlug(SLUG)).toBe(1)
    const second = await sendNewsletterWorkflow(SLUG)
    expect(second).toEqual(workflowResult({ batches: 1, sent: 1, failed: 0 }))

    // The same two rows: the errored one was reused, nobody got a duplicate,
    // and the original delivery is untouched.
    const healed = await allRows()
    expect(healed.map((r) => r.id)).toEqual(rows.map((r) => r.id))
    expect(rowFor(healed, alice.id).sentAt).toEqual(aliceRow.sentAt)
    const healedBob = rowFor(healed, bob.id)
    expect(healedBob.sentAt).not.toBeNull()
    expect(healedBob.sendError).toBeNull()
    expect(mockedSes).toHaveBeenCalledTimes(1)
    expect(mockedSes).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'bob@example.com' })
    )
  })

  it('sends eligible SMS subscribers once and records outbound text history', async () => {
    await seedSubscriber({ email: 'alice@example.com' })
    const smsSubscriber = await seedSmsSubscriber({
      phoneNumber: '+15551234567',
    })

    const result = await sendNewsletterWorkflow(SLUG)

    expect(result).toEqual(
      workflowResult({
        batches: 1,
        sent: 1,
        failed: 0,
        smsBatches: 1,
        smsSent: 1,
        smsFailed: 0,
      })
    )

    const rows = await allSmsRows()
    expect(rows).toHaveLength(1)
    const smsRow = smsRowFor(rows, smsSubscriber.id)
    expect(smsRow.sentAt).not.toBeNull()
    expect(smsRow.sendError).toBeNull()
    expect(smsRow.twilioSid).toBe('SM_test')
    expect(smsRow.body).toContain('Contraption: Hello world')
    expect(smsRow.body).toContain(
      'https://www.philipithomas.com/hello-world?utm_source=sms'
    )
    expect(smsRow.body).toContain('Reply STOP to unsubscribe.')

    const outboundTexts = await db.select().from(textMessages)
    expect(outboundTexts).toHaveLength(1)
    expect(outboundTexts[0]).toMatchObject({
      fromNumber: '+12123473190',
      toNumber: '+15551234567',
      direction: 'outbound',
      twilioSid: 'SM_test',
      status: 'queued',
    })

    vi.mocked(fetch).mockClear()
    const second = await sendNewsletterWorkflow(SLUG)

    expect(second).toEqual(
      workflowResult({
        batches: 0,
        sent: 0,
        failed: 0,
        smsBatches: 0,
        smsSent: 0,
        smsFailed: 0,
      })
    )
    expect(await allSmsRows()).toHaveLength(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('marks a failed SMS row and keeps the email send complete', async () => {
    await seedSubscriber({ email: 'alice@example.com' })
    const smsSubscriber = await seedSmsSubscriber({
      phoneNumber: '+15551234567',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'not a valid number' }), {
            status: 400,
          })
      )
    )

    const result = await sendNewsletterWorkflow(SLUG)

    expect(result).toEqual(
      workflowResult({
        batches: 1,
        sent: 1,
        failed: 0,
        smsBatches: 1,
        smsSent: 0,
        smsFailed: 1,
      })
    )
    const smsRow = smsRowFor(await allSmsRows(), smsSubscriber.id)
    expect(smsRow.sentAt).toBeNull()
    expect(smsRow.sendError).toContain('Twilio send failed')
    expect(await db.select().from(textMessages)).toHaveLength(0)
  })

  it('keeps a transient SMS failure retryable and leaves the row sendable', async () => {
    await seedSubscriber({ email: 'alice@example.com' })
    const smsSubscriber = await seedSmsSubscriber({
      phoneNumber: '+15551234567',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'rate limited' }), {
            status: 429,
          })
      )
    )

    const err = await sendNewsletterWorkflow(SLUG).catch((e) => e)

    expect(err).toBeInstanceOf(RetryableError)
    expect(err.message).toContain('rate limited')
    const smsRow = smsRowFor(await allSmsRows(), smsSubscriber.id)
    expect(smsRow.sentAt).toBeNull()
    expect(smsRow.sendError).toBeNull()
    expect(smsRow.nextAttemptAt).toBeInstanceOf(Date)
    expect(await pendingSmsRowIdsBySlug(SLUG)).toEqual([smsRow.id])
    expect(await db.select().from(textMessages)).toHaveLength(0)
  })

  it('honors an SMS opt-out that arrives before the recipient turn in a paced batch', async () => {
    const bob = await seedSmsSubscriber({
      phoneNumber: '+15557654321',
    })
    const alice = await seedSmsSubscriber({
      phoneNumber: '+15551234567',
    })
    let sendCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        sendCount += 1
        await unsubscribeSmsNumber(bob.phoneNumber)
        return new Response(
          JSON.stringify({ sid: `SM_${sendCount}`, status: 'queued' }),
          { status: 201 }
        )
      })
    )

    const result = await sendNewsletterWorkflow(SLUG)

    expect(result).toEqual(
      workflowResult({
        batches: 0,
        sent: 0,
        failed: 0,
        smsBatches: 1,
        smsSent: 1,
        smsFailed: 0,
      })
    )
    expect(fetch).toHaveBeenCalledTimes(1)

    const rows = await allSmsRows()
    const aliceRow = smsRowFor(rows, alice.id)
    expect(aliceRow.sentAt).not.toBeNull()
    expect(aliceRow.sendError).toBeNull()
    expect(aliceRow.twilioSid).toBe('SM_1')

    const bobRow = smsRowFor(rows, bob.id)
    expect(bobRow.sentAt).toBeNull()
    expect(bobRow.sendError).toBe(SMS_SEND_SKIPPED_UNSUBSCRIBED)
    expect(bobRow.twilioSid).toBeNull()

    const outboundTexts = await db.select().from(textMessages)
    expect(outboundTexts).toHaveLength(1)
    expect(outboundTexts[0]).toMatchObject({
      toNumber: '+15551234567',
      twilioSid: 'SM_1',
    })
  })

  it('does not queue SMS rows for ids that opted out after eligibility was read', async () => {
    const subscriber = await seedSmsSubscriber({
      phoneNumber: '+15551234567',
    })
    await unsubscribeSmsNumber(subscriber.phoneNumber)

    const ids = await bulkCreateQueuedSms({
      smsSubscriberIds: [subscriber.id],
      postSlug: SLUG,
      newsletter: 'contraption',
      body: 'Contraption: Hello world',
    })

    expect(ids).toEqual([])
    expect(await allSmsRows()).toHaveLength(0)
  })

  it('removes claimed SMS rows from the sendable set until the claim expires', async () => {
    const subscriber = await seedSmsSubscriber({
      phoneNumber: '+15551234567',
    })
    const [rowId] = await bulkCreateQueuedSms({
      smsSubscriberIds: [subscriber.id],
      postSlug: SLUG,
      newsletter: 'contraption',
      body: 'Contraption: Hello world',
    })

    expect(await pendingSmsRowIdsBySlug(SLUG)).toEqual([rowId])

    const firstClaim = await claimSendableSmsById(rowId)

    expect(firstClaim?.phoneNumber).toBe(subscriber.phoneNumber)
    expect(await claimSendableSmsById(rowId)).toBeNull()
    expect(await pendingSmsRowIdsBySlug(SLUG)).toEqual([])
    const row = smsRowFor(await allSmsRows(), subscriber.id)
    expect(row.sentAt).toBeNull()
    expect(row.sendError).toBeNull()
    expect(row.nextAttemptAt).toBeInstanceOf(Date)
    expect(row.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now())
  })

  it('marks stale unconfirmed pending SMS rows skipped while draining the queue', async () => {
    const subscriber = await seedSmsSubscriber({
      phoneNumber: '+15551234567',
      confirmed: false,
    })
    await db.insert(smsSends).values({
      smsSubscriberId: subscriber.id,
      postSlug: SLUG,
      newsletter: 'contraption',
      body: 'Contraption: Hello world',
      nextAttemptAt: new Date(),
    })

    const result = await sendNewsletterWorkflow(SLUG)

    expect(result).toEqual(
      workflowResult({
        batches: 0,
        sent: 0,
        failed: 0,
        smsBatches: 1,
        smsSent: 0,
        smsFailed: 0,
      })
    )
    expect(fetch).not.toHaveBeenCalled()
    const row = smsRowFor(await allSmsRows(), subscriber.id)
    expect(row.sentAt).toBeNull()
    expect(row.sendError).toBe(SMS_SEND_SKIPPED_UNSUBSCRIBED)
    expect(row.nextAttemptAt).toBeNull()
  })

  it('retries instead of skipping SMS rows that are still reserved', async () => {
    const subscriber = await seedSmsSubscriber({
      phoneNumber: '+15551234567',
    })
    const reservedUntil = new Date(Date.now() + 10 * 60 * 1000)
    const [queued] = await db
      .insert(smsSends)
      .values({
        smsSubscriberId: subscriber.id,
        postSlug: SLUG,
        newsletter: 'contraption',
        body: 'Contraption: Hello world',
        nextAttemptAt: reservedUntil,
      })
      .returning()

    const err = await sendSmsBatch([queued.id]).catch((e) => e)

    expect(err).toBeInstanceOf(RetryableError)
    expect(err.message).toContain(`SMS send ${queued.id} is reserved`)
    expect(fetch).not.toHaveBeenCalled()
    const row = smsRowFor(await allSmsRows(), subscriber.id)
    expect(row.sentAt).toBeNull()
    expect(row.sendError).toBeNull()
    expect(row.nextAttemptAt).toEqual(reservedUntil)
  })

  it('preserves skipped opt-out markers when a permanent SMS failure races with STOP', async () => {
    const subscriber = await seedSmsSubscriber({
      phoneNumber: '+15551234567',
    })
    const [queued] = await db
      .insert(smsSends)
      .values({
        smsSubscriberId: subscriber.id,
        postSlug: SLUG,
        newsletter: 'contraption',
        body: 'Contraption: Hello world',
        nextAttemptAt: new Date(),
      })
      .returning()

    await unsubscribeSmsNumber(subscriber.phoneNumber)
    const markedFailed = await markSmsPermanentFailure(
      queued.id,
      'Twilio rejected this recipient'
    )

    expect(markedFailed).toBe(false)
    const row = smsRowFor(await allSmsRows(), subscriber.id)
    expect(row.sentAt).toBeNull()
    expect(row.sendError).toBe(SMS_SEND_SKIPPED_UNSUBSCRIBED)
    expect(row.attempts).toBe(0)
    expect(await resetFailedSmsBySlug(SLUG)).toBe(0)
  })
})
