import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Post } from '@/lib/content/types'

// Real PGlite database with the real migrations applied (including the
// (subscriber_id, post_slug) unique index); all of @/lib/db/queries/* runs
// real SQL against it.
vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('next/headers', () => import('@/test/integration/session'))

// The workflow start/status seam: both routes hand off to the durable workflow
// via start(), and the guards read run liveness via getRun(runId).status. The
// workflow itself is covered by send-newsletter.integration.test.ts.
vi.mock('workflow/api', () => ({ start: vi.fn(), getRun: vi.fn() }))

// The content loader reads MDX from disk; pin a synthetic post instead.
vi.mock('@/lib/content/loader', () => ({
  getPostBySlug: vi.fn(),
}))

// Nothing in these routes should ever reach SES; keep the seam cut anyway.
vi.mock('@/lib/email/ses', () =>
  import('@/test/integration/mocks').then((m) => m.sesMock())
)

import { getRun, start } from 'workflow/api'
import { POST as retryPost } from '@/app/api/printing-press/retry/route'
import { POST as sendPost } from '@/app/api/printing-press/send/route'
import { GET as statusGet } from '@/app/api/printing-press/send-status/[slug]/route'
import { signSession } from '@/lib/auth/jwt'
import { getPostBySlug } from '@/lib/content/loader'
import {
  bulkCreateQueued,
  pendingRowIdsBySlug,
} from '@/lib/db/queries/email-sends'
import { latestRunIdBySlug, recordSendRun } from '@/lib/db/queries/send-runs'
import { emailSends, subscribers } from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'
import { clearSessionStore, setSessionCookie } from '@/test/integration/session'
import { sendNewsletterWorkflow } from '@/workflows/send-newsletter'

const mockedStart = vi.mocked(start)
const mockedGetRun = vi.mocked(getRun)
const mockedGetPost = vi.mocked(getPostBySlug)

const SLUG = 'hello-world'
const POST = { slug: SLUG, newsletter: 'contraption' } as Post
const RUN = { runId: 'run-1' } as Awaited<ReturnType<typeof start>>

// Mirrors @workflow/world's WorkflowRunStatus (not a direct dep, so spelled out).
type WorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

/**
 * Points getRun at a status. The guard reads only `.status` (a Promise), so the
 * stub returns a thin object with that one resolved getter.
 */
function stubRunStatus(status: WorkflowRunStatus) {
  mockedGetRun.mockReturnValue({
    status: Promise.resolve(status),
  } as unknown as ReturnType<typeof getRun>)
}

/** Makes getRun throw, as it does when the runtime no longer knows the run. */
function stubRunMissing() {
  mockedGetRun.mockImplementation(() => {
    throw new Error('WorkflowRunNotFoundError')
  })
}

function request(path: 'send' | 'retry', body: unknown) {
  return new NextRequest(`http://localhost/api/printing-press/${path}`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function statusRequest() {
  return new NextRequest(
    `http://localhost/api/printing-press/send-status/${SLUG}`
  )
}

async function signInAs(email: string) {
  setSessionCookie(await signSession({ uuid: randomUUID(), email, name: null }))
}

const signInAsAdmin = () => signInAs('admin@example.com')

async function seedSubscriber(email: string) {
  const [row] = await db
    .insert(subscribers)
    .values({ email, confirmedAt: new Date() })
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

/** The runId the route persisted for SLUG (via the real send_runs query). */
const latestRunId = () => latestRunIdBySlug(SLUG)

beforeEach(async () => {
  clearSessionStore()
  await resetDb()
  mockedStart.mockReset()
  mockedStart.mockResolvedValue(RUN)
  mockedGetRun.mockReset()
  // Default: no run is live. The guard short-circuits on no recorded runId
  // anyway, but tests that record a runId opt into a status with stubRunStatus.
  stubRunStatus('completed')
  mockedGetPost.mockReset()
  mockedGetPost.mockReturnValue(POST)
})

describe('admin guard', () => {
  it('returns 403 on both handlers when no session cookie is set', async () => {
    for (const handler of [sendPost, retryPost]) {
      const res = await handler(request('send', { slug: SLUG }))
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'Forbidden' })
    }
    expect(mockedStart).not.toHaveBeenCalled()
  })

  it('returns 403 on both handlers for a signed-in non-admin', async () => {
    await signInAs('user@example.com')
    for (const handler of [sendPost, retryPost]) {
      const res = await handler(request('send', { slug: SLUG }))
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'Forbidden' })
    }
    expect(mockedStart).not.toHaveBeenCalled()
  })
})

describe('request validation (both handlers)', () => {
  it('returns 400 (not 500) for a malformed JSON body', async () => {
    await signInAsAdmin()
    for (const handler of [sendPost, retryPost]) {
      const res = await handler(request('send', 'not json'))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Invalid request body' })
    }
  })

  it('returns 400 when slug is missing', async () => {
    await signInAsAdmin()
    for (const handler of [sendPost, retryPost]) {
      const res = await handler(request('send', {}))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'slug is required' })
    }
  })

  it('returns 404 for an unknown slug without starting a workflow', async () => {
    await signInAsAdmin()
    mockedGetPost.mockReturnValue(null)
    for (const handler of [sendPost, retryPost]) {
      const res = await handler(request('send', { slug: 'missing' }))
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({
        error: 'Not a sendable newsletter post',
      })
    }
    expect(mockedStart).not.toHaveBeenCalled()
  })

  it('returns 404 for a non-newsletter post', async () => {
    await signInAsAdmin()
    mockedGetPost.mockReturnValue({
      slug: SLUG,
      newsletter: 'essay',
    } as unknown as Post)
    for (const handler of [sendPost, retryPost]) {
      const res = await handler(request('send', { slug: SLUG }))
      expect(res.status).toBe(404)
    }
    expect(mockedStart).not.toHaveBeenCalled()
  })
})

describe('POST send', () => {
  it('returns 409 only while a recorded run is genuinely running, not just because rows are pending', async () => {
    await signInAsAdmin()
    const sub = await seedSubscriber('alice@example.com')
    await seedSendRow(sub.id) // pending: not sent, no error
    // A run was recorded for this slug and the runtime reports it as live.
    await recordSendRun(SLUG, 'run-1')
    stubRunStatus('running')

    const res = await sendPost(request('send', { slug: SLUG }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'A send for this post is already in progress.',
    })
    expect(mockedStart).not.toHaveBeenCalled()
    expect(mockedGetRun).toHaveBeenCalledWith('run-1')
  })

  it('heals failed rows BEFORE starting the workflow, then records and reports the run id', async () => {
    await signInAsAdmin()
    const sub = await seedSubscriber('alice@example.com')
    const failedRow = await seedSendRow(sub.id, { sendError: 'boom' })

    // Capture what the workflow would see at start time.
    let pendingAtStart: number[] = []
    mockedStart.mockImplementation(async () => {
      pendingAtStart = await pendingRowIdsBySlug(SLUG)
      return RUN
    })

    const res = await sendPost(request('send', { slug: SLUG }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, runId: 'run-1' })
    expect(mockedStart).toHaveBeenCalledTimes(1)
    expect(mockedStart).toHaveBeenCalledWith(sendNewsletterWorkflow, [SLUG])
    // The errored row was already pending when the workflow started, so the
    // run reuses it instead of enqueueing a duplicate.
    expect(pendingAtStart).toEqual([failedRow.id])
    const [healed] = await allRows()
    expect(healed.id).toBe(failedRow.id)
    expect(healed.sendError).toBeNull()
    expect(healed.sentAt).toBeNull()
    // The runId is persisted so a later send/retry can check this run's status.
    expect(await latestRunId()).toBe('run-1')
  })
})

describe('POST retry', () => {
  it('returns 409 while a recorded run is genuinely running and leaves failed rows unhealed', async () => {
    await signInAsAdmin()
    const alice = await seedSubscriber('alice@example.com')
    const bob = await seedSubscriber('bob@example.com')
    await seedSendRow(alice.id) // in-flight pending row
    const failedRow = await seedSendRow(bob.id, { sendError: 'boom' })
    await recordSendRun(SLUG, 'run-1')
    stubRunStatus('running')

    const res = await retryPost(request('retry', { slug: SLUG }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'A send for this post is already in progress.',
    })
    expect(mockedStart).not.toHaveBeenCalled()
    // The guard runs before the heal: the failed row keeps its error so the
    // live run cannot pick it up.
    const rows = await allRows()
    expect(rows.find((r) => r.id === failedRow.id)?.sendError).toBe('boom')
  })

  // Regression: the deadlock fix. Pending rows + a dead run (the run failed,
  // was cancelled, or completed but stranded rows) must NOT block retry — retry
  // is the designed resume path for exactly that stalled state.
  it.each([
    ['completed', 'completed' as const],
    ['failed', 'failed' as const],
    ['cancelled', 'cancelled' as const],
  ])('resumes a stalled send when the recorded run is %s, even with rows still pending', async (_label, status) => {
    await signInAsAdmin()
    const alice = await seedSubscriber('alice@example.com')
    const bob = await seedSubscriber('bob@example.com')
    const pendingRow = await seedSendRow(alice.id) // stranded pending row
    const failedRow = await seedSendRow(bob.id, { sendError: 'boom' })
    // The earlier run died; its runId is still recorded.
    await recordSendRun(SLUG, 'dead-run')
    stubRunStatus(status)

    let pendingAtStart: number[] = []
    mockedStart.mockImplementation(async () => {
      pendingAtStart = await pendingRowIdsBySlug(SLUG)
      return { runId: 'run-2' } as Awaited<ReturnType<typeof start>>
    })

    const res = await retryPost(request('retry', { slug: SLUG }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, reset: 1, runId: 'run-2' })
    expect(mockedStart).toHaveBeenCalledWith(sendNewsletterWorkflow, [SLUG])
    // Both the stranded pending row and the healed failed row are handed to
    // the fresh run.
    expect(pendingAtStart.sort((a, b) => a - b)).toEqual(
      [pendingRow.id, failedRow.id].sort((a, b) => a - b)
    )
    // The fresh runId replaces the dead one.
    expect(await latestRunId()).toBe('run-2')
  })

  it('resumes a stalled send when the runtime no longer knows the recorded run', async () => {
    await signInAsAdmin()
    const alice = await seedSubscriber('alice@example.com')
    await seedSendRow(alice.id) // stranded pending row
    await recordSendRun(SLUG, 'expired-run')
    stubRunMissing()

    const res = await retryPost(request('retry', { slug: SLUG }))

    expect(res.status).toBe(200)
    expect(mockedStart).toHaveBeenCalledWith(sendNewsletterWorkflow, [SLUG])
  })

  it('heals failed rows, starts the workflow, and reports the reset count', async () => {
    await signInAsAdmin()
    const alice = await seedSubscriber('alice@example.com')
    const bob = await seedSubscriber('bob@example.com')
    const carol = await seedSubscriber('carol@example.com')
    const failedA = await seedSendRow(alice.id, { sendError: 'boom' })
    const failedB = await seedSendRow(bob.id, { sendError: 'boom' })
    const sentRow = await seedSendRow(carol.id, { sentAt: new Date() })

    let pendingAtStart: number[] = []
    mockedStart.mockImplementation(async () => {
      pendingAtStart = await pendingRowIdsBySlug(SLUG)
      return RUN
    })

    const res = await retryPost(request('retry', { slug: SLUG }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, reset: 2, runId: 'run-1' })
    expect(mockedStart).toHaveBeenCalledWith(sendNewsletterWorkflow, [SLUG])
    expect(pendingAtStart.sort((a, b) => a - b)).toEqual([
      failedA.id,
      failedB.id,
    ])
    const rows = await allRows()
    for (const id of [failedA.id, failedB.id]) {
      const row = rows.find((r) => r.id === id)
      expect(row?.sendError).toBeNull()
      expect(row?.sentAt).toBeNull()
    }
    // The delivered row is untouched.
    expect(rows.find((r) => r.id === sentRow.id)?.sentAt).not.toBeNull()
  })
})

describe('GET send status', () => {
  it('reports a pending workflow as active before recipient rows exist', async () => {
    await signInAsAdmin()
    await recordSendRun(SLUG, 'run-1')
    stubRunStatus('pending')

    const res = await statusGet(statusRequest(), {
      params: Promise.resolve({ slug: SLUG }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      total: 0,
      sent: 0,
      pending: 0,
      failed: 0,
      eligible: 0,
      smsEligible: 0,
      active: true,
    })
  })

  it('does not report a cancelled workflow as active', async () => {
    await signInAsAdmin()
    await recordSendRun(SLUG, 'run-1')
    stubRunStatus('cancelled')

    const res = await statusGet(statusRequest(), {
      params: Promise.resolve({ slug: SLUG }),
    })

    expect(res.status).toBe(200)
    expect((await res.json()).active).toBe(false)
  })
})

describe('bulkCreateQueued conflict handling', () => {
  const input = (subscriberIds: number[]) => ({
    subscriberIds,
    postSlug: SLUG,
    newsletter: 'contraption',
    subject: 'Hello',
    htmlContent: '<p>hi</p>',
  })

  it('ignores duplicate (subscriber, post) enqueues from racing runs', async () => {
    const sub = await seedSubscriber('alice@example.com')

    const first = await bulkCreateQueued(input([sub.id]))
    expect(first).toHaveLength(1)

    // A second run racing the same enqueue is a no-op, not an error.
    const second = await bulkCreateQueued(input([sub.id]))
    expect(second).toEqual([])
    expect(await allRows()).toHaveLength(1)
  })

  it('inserts only the new pairs when a batch mixes new and already-enqueued', async () => {
    const alice = await seedSubscriber('alice@example.com')
    const bob = await seedSubscriber('bob@example.com')
    await bulkCreateQueued(input([alice.id]))

    const ids = await bulkCreateQueued(input([alice.id, bob.id]))

    expect(ids).toHaveLength(1)
    const rows = await allRows()
    expect(rows.map((r) => r.subscriberId).sort((a, b) => a - b)).toEqual([
      alice.id,
      bob.id,
    ])
  })

  it('the unique index rejects a raw duplicate insert at the database level', async () => {
    const sub = await seedSubscriber('alice@example.com')
    await seedSendRow(sub.id)

    const err = await db
      .insert(emailSends)
      .values({ subscriberId: sub.id, postSlug: SLUG })
      .then(
        () => null,
        (e: unknown) => e
      )
    expect(err).toBeInstanceOf(Error)
    // Drizzle wraps the driver error; the unique violation rides on cause.
    expect(String((err as Error).cause ?? err)).toMatch(/duplicate key|unique/i)
    expect(await allRows()).toHaveLength(1)
  })

  it('still allows the same subscriber across different posts', async () => {
    const sub = await seedSubscriber('alice@example.com')
    await seedSendRow(sub.id)
    await seedSendRow(sub.id, { postSlug: 'another-post' })
    expect(await allRows()).toHaveLength(2)
  })
})
