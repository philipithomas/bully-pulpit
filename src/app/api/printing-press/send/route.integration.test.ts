import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Post } from '@/lib/content/types'

// Real PGlite database with the real migrations applied (including the
// (subscriber_id, post_slug) unique index); all of @/lib/db/queries/* runs
// real SQL against it.
vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('next/headers', () => import('@/test/integration/session'))

// The workflow start seam: both routes hand off to the durable workflow here.
// The workflow itself is covered by send-newsletter.integration.test.ts.
vi.mock('workflow/api', () => ({ start: vi.fn() }))

// The content loader reads MDX from disk; pin a synthetic post instead.
vi.mock('@/lib/content/loader', () => ({
  getPostBySlug: vi.fn(),
}))

// Nothing in these routes should ever reach SES; keep the seam cut anyway.
vi.mock('@/lib/email/ses', () =>
  import('@/test/integration/mocks').then((m) => m.sesMock())
)

import { start } from 'workflow/api'
import { POST as retryPost } from '@/app/api/printing-press/retry/route'
import { POST as sendPost } from '@/app/api/printing-press/send/route'
import { signSession } from '@/lib/auth/jwt'
import { getPostBySlug } from '@/lib/content/loader'
import {
  bulkCreateQueued,
  pendingRowIdsBySlug,
} from '@/lib/db/queries/email-sends'
import { emailSends, subscribers } from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'
import { clearSessionStore, setSessionCookie } from '@/test/integration/session'
import { sendNewsletterWorkflow } from '@/workflows/send-newsletter'

const mockedStart = vi.mocked(start)
const mockedGetPost = vi.mocked(getPostBySlug)

const SLUG = 'hello-world'
const POST = { slug: SLUG, newsletter: 'contraption' } as Post
const RUN = { runId: 'run-1' } as Awaited<ReturnType<typeof start>>

function request(path: 'send' | 'retry', body: unknown) {
  return new NextRequest(`http://localhost/api/printing-press/${path}`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
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

beforeEach(async () => {
  clearSessionStore()
  await resetDb()
  mockedStart.mockReset()
  mockedStart.mockResolvedValue(RUN)
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
  it('returns 409 while a send is in flight and does not start a second run', async () => {
    await signInAsAdmin()
    const sub = await seedSubscriber('alice@example.com')
    await seedSendRow(sub.id) // pending: not sent, no error

    const res = await sendPost(request('send', { slug: SLUG }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'A send for this post is already in progress.',
    })
    expect(mockedStart).not.toHaveBeenCalled()
  })

  it('heals failed rows BEFORE starting the workflow, then reports the run id', async () => {
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
  })
})

describe('POST retry', () => {
  it('returns 409 while rows are pending and leaves failed rows unhealed', async () => {
    await signInAsAdmin()
    const alice = await seedSubscriber('alice@example.com')
    const bob = await seedSubscriber('bob@example.com')
    await seedSendRow(alice.id) // in-flight pending row
    const failedRow = await seedSendRow(bob.id, { sendError: 'boom' })

    const res = await retryPost(request('retry', { slug: SLUG }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'A send for this post is already in progress.',
    })
    expect(mockedStart).not.toHaveBeenCalled()
    // The pending check runs before the heal: the failed row keeps its error
    // so the racing run cannot pick it up.
    const rows = await allRows()
    expect(rows.find((r) => r.id === failedRow.id)?.sendError).toBe('boom')
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
