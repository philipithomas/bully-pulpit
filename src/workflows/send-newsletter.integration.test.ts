import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Post } from '@/lib/content/types'

// Real PGlite database with the real migrations applied; all of
// @/lib/db/queries/* runs real SQL against it.
vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

// Without the Workflow compiler the 'use workflow'/'use step' directives are
// no-ops, so the workflow runs as a plain async function. getStepMetadata
// throws outside the runtime, so stub it; keep the real error classes.
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
vi.mock('@/lib/content/loader', () => ({
  getPostBySlug: vi.fn(),
}))

// Rendering pulls in related-posts artifacts; pin a synthetic body instead.
vi.mock('@/lib/email/render-body', () => ({
  buildEmailBodyHtml: vi.fn(),
}))

// Cut only the SES boundary; everything else in the module stays real.
vi.mock('@/lib/email/send', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/email/send')>()
  return {
    ...actual,
    sendQueuedEmail: vi.fn(),
  }
})

import { getPostBySlug } from '@/lib/content/loader'
import { resetFailedBySlug } from '@/lib/db/queries/email-sends'
import { emailSends, subscribers } from '@/lib/db/schema'
import { buildEmailBodyHtml } from '@/lib/email/render-body'
import { sendQueuedEmail } from '@/lib/email/send'
import { db, resetDb } from '@/test/integration/db'
import { sendNewsletterWorkflow } from '@/workflows/send-newsletter'

const mockedGetPost = vi.mocked(getPostBySlug)
const mockedBuildBody = vi.mocked(buildEmailBodyHtml)
const mockedSendQueued = vi.mocked(sendQueuedEmail)

const SLUG = 'hello-world'
const POST = { slug: SLUG, newsletter: 'contraption' } as Post

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

function allRows() {
  return db.select().from(emailSends).orderBy(emailSends.id)
}

beforeEach(async () => {
  await resetDb()
  mockedSendQueued.mockReset()
  mockedSendQueued.mockResolvedValue(undefined)
  mockedGetPost.mockReset()
  mockedGetPost.mockReturnValue(POST)
  mockedBuildBody.mockReset()
  mockedBuildBody.mockResolvedValue(BODY)
})

// Real timers throughout: the workflow paces SEND_SPACING_MS (80ms) per
// recipient inside the step, so keep seeds tiny (≤3 recipients per test).
describe('sendNewsletterWorkflow (integration)', () => {
  it('enqueues only confirmed opted-in subscribers and marks every row sent', async () => {
    const alice = await seedSubscriber({ email: 'alice@example.com' })
    const bob = await seedSubscriber({ email: 'bob@example.com' })
    await seedSubscriber({ email: 'unconfirmed@example.com', confirmed: false })
    await seedSubscriber({ email: 'optout@example.com', contraption: false })

    const result = await sendNewsletterWorkflow(SLUG)

    expect(result).toEqual({ batches: 1, sent: 2, failed: 0 })

    const rows = await allRows()
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.subscriberId).sort((a, b) => a - b)).toEqual([
      alice.id,
      bob.id,
    ])
    for (const row of rows) {
      expect(row.postSlug).toBe(SLUG)
      expect(row.newsletter).toBe('contraption')
      expect(row.subject).toBe(BODY.subject)
      expect(row.htmlContent).toBe(BODY.html)
      expect(row.textContent).toBe(BODY.bodyText)
      expect(row.previewText).toBe(BODY.previewText)
      expect(row.sentAt).not.toBeNull()
      expect(row.sendError).toBeNull()
    }

    expect(mockedSendQueued).toHaveBeenCalledTimes(2)
    const aliceRow = rows.find((r) => r.subscriberId === alice.id)
    const bobRow = rows.find((r) => r.subscriberId === bob.id)
    expect(mockedSendQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'alice@example.com',
        subject: BODY.subject,
        unsubscribeToken: aliceRow?.unsubscribeToken,
      })
    )
    expect(mockedSendQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'bob@example.com',
        unsubscribeToken: bobRow?.unsubscribeToken,
      })
    )
  })

  it('is idempotent: a second run creates no rows and sends nothing', async () => {
    await seedSubscriber({ email: 'alice@example.com' })
    await seedSubscriber({ email: 'bob@example.com' })

    const first = await sendNewsletterWorkflow(SLUG)
    expect(first).toEqual({ batches: 1, sent: 2, failed: 0 })
    const rowsAfterFirst = await allRows()
    mockedSendQueued.mockClear()

    const second = await sendNewsletterWorkflow(SLUG)

    expect(second).toEqual({ batches: 0, sent: 0, failed: 0 })
    const rowsAfterSecond = await allRows()
    expect(rowsAfterSecond.map((r) => r.id)).toEqual(
      rowsAfterFirst.map((r) => r.id)
    )
    expect(mockedSendQueued).not.toHaveBeenCalled()
  })

  it('heals a failed row via resetFailedBySlug without duplicating anyone', async () => {
    const alice = await seedSubscriber({ email: 'alice@example.com' })
    const bob = await seedSubscriber({ email: 'bob@example.com' })

    // Permanent SES failure (MessageRejected) for bob only.
    mockedSendQueued.mockImplementation(async ({ email }) => {
      if (email === 'bob@example.com') {
        throw Object.assign(new Error('Email address is not verified.'), {
          name: 'MessageRejected',
        })
      }
    })

    const first = await sendNewsletterWorkflow(SLUG)
    expect(first).toEqual({ batches: 1, sent: 1, failed: 1 })

    const rows = await allRows()
    expect(rows).toHaveLength(2)
    const aliceRow = rows.find((r) => r.subscriberId === alice.id)
    const bobRow = rows.find((r) => r.subscriberId === bob.id)
    expect(aliceRow?.sentAt).not.toBeNull()
    expect(bobRow?.sentAt).toBeNull()
    expect(bobRow?.sendError).toBe('Email address is not verified.')
    expect(bobRow?.attempts).toBe(1)

    // Heal: restore SES, clear the error so the row is sendable again.
    mockedSendQueued.mockReset()
    mockedSendQueued.mockResolvedValue(undefined)
    expect(await resetFailedBySlug(SLUG)).toBe(1)

    const second = await sendNewsletterWorkflow(SLUG)
    expect(second).toEqual({ batches: 1, sent: 1, failed: 0 })

    // Same two rows — the errored one was reused, nobody got a duplicate.
    const healed = await allRows()
    expect(healed.map((r) => r.id)).toEqual(rows.map((r) => r.id))
    const healedBob = healed.find((r) => r.id === bobRow?.id)
    expect(healedBob?.sentAt).not.toBeNull()
    expect(healedBob?.sendError).toBeNull()
    expect(mockedSendQueued).toHaveBeenCalledTimes(1)
    expect(mockedSendQueued).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'bob@example.com' })
    )
  })
})
