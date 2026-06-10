import { inArray } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  allSendStats,
  bulkCreateQueued,
  findSendableByIds,
  lastCompletedSend,
  markPermanentFailure,
  markSent,
  pendingRowIdsBySlug,
  resetFailedBySlug,
  sendStatsBySlug,
} from '@/lib/db/queries/email-sends'
import { emailSends, subscribers } from '@/lib/db/schema'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import { db, resetDb } from '@/test/integration/db'

beforeEach(resetDb)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

async function seedSubscribers(emails: string[]): Promise<number[]> {
  const rows = await db
    .insert(subscribers)
    .values(emails.map((email) => ({ email })))
    .returning({ id: subscribers.id })
  return rows.map((r) => r.id)
}

async function seedSend(
  subscriberId: number,
  postSlug: string,
  overrides: Partial<typeof emailSends.$inferInsert> = {}
) {
  const [row] = await db
    .insert(emailSends)
    .values({ subscriberId, postSlug, ...overrides })
    .returning()
  return row
}

async function fetchSends(ids: number[]) {
  return db.select().from(emailSends).where(inArray(emailSends.id, ids))
}

describe('bulkCreateQueued', () => {
  it('creates one queued row per subscriber and snapshots the content', async () => {
    const subscriberIds = await seedSubscribers([
      'a@example.com',
      'b@example.com',
      'c@example.com',
    ])

    const ids = await bulkCreateQueued({
      subscriberIds,
      postSlug: 'hello-world',
      newsletter: 'contraption',
      subject: 'Hello World',
      htmlContent: '<p>Hi</p>',
      textContent: 'Hi',
      previewText: 'A greeting',
    })

    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)

    const rows = await fetchSends(ids)
    expect(rows).toHaveLength(3)
    expect(new Set(rows.map((r) => r.subscriberId))).toEqual(
      new Set(subscriberIds)
    )
    for (const row of rows) {
      expect(row.postSlug).toBe('hello-world')
      expect(row.newsletter).toBe('contraption')
      expect(row.subject).toBe('Hello World')
      expect(row.htmlContent).toBe('<p>Hi</p>')
      expect(row.textContent).toBe('Hi')
      expect(row.previewText).toBe('A greeting')
      expect(row.nextAttemptAt).toBeInstanceOf(Date)
      expect(row.sentAt).toBeNull()
      expect(row.sendError).toBeNull()
      expect(row.attempts).toBe(0)
    }

    const tokens = rows.map((r) => r.unsubscribeToken)
    expect(new Set(tokens).size).toBe(3)
    for (const token of tokens) {
      expect(token).toMatch(UUID_RE)
    }
  })

  it('defaults textContent and previewText to null when omitted', async () => {
    const subscriberIds = await seedSubscribers(['a@example.com'])
    const ids = await bulkCreateQueued({
      subscriberIds,
      postSlug: 'no-text',
      newsletter: 'workshop',
      subject: 'No text part',
      htmlContent: '<p>Only html</p>',
    })
    const [row] = await fetchSends(ids)
    expect(row.textContent).toBeNull()
    expect(row.previewText).toBeNull()
  })

  it('chunks inserts beyond 500 subscribers and still returns every id', async () => {
    const emails = Array.from(
      { length: 501 },
      (_, i) => `bulk-${i}@example.com`
    )
    const subscriberIds = await seedSubscribers(emails)

    const ids = await bulkCreateQueued({
      subscriberIds,
      postSlug: 'big-send',
      newsletter: 'postcard',
      subject: 'Big',
      htmlContent: '<p>Big</p>',
    })

    expect(ids).toHaveLength(501)
    expect(new Set(ids).size).toBe(501)
    const stats = await sendStatsBySlug('big-send')
    expect(stats.total).toBe(501)
  })
})

describe('findSendableByIds', () => {
  it('excludes already-sent and errored rows and joins the recipient email', async () => {
    const [aliceId, bobId, carolId] = await seedSubscribers([
      'alice@example.com',
      'bob@example.com',
      'carol@example.com',
    ])
    const pending = await seedSend(aliceId, 'post-a')
    const sent = await seedSend(bobId, 'post-a', { sentAt: new Date() })
    const errored = await seedSend(carolId, 'post-a', { sendError: 'boom' })

    const claimed = await findSendableByIds([pending.id, sent.id, errored.id])

    expect(claimed).toHaveLength(1)
    expect(claimed[0].send.id).toBe(pending.id)
    expect(claimed[0].email).toBe('alice@example.com')
  })

  it('only returns rows in the requested id set', async () => {
    const [aliceId, bobId] = await seedSubscribers([
      'alice@example.com',
      'bob@example.com',
    ])
    const wanted = await seedSend(aliceId, 'post-a')
    await seedSend(bobId, 'post-a')

    const claimed = await findSendableByIds([wanted.id])
    expect(claimed.map((c) => c.send.id)).toEqual([wanted.id])
  })

  it('returns an empty array for an empty id list', async () => {
    await expect(findSendableByIds([])).resolves.toEqual([])
  })
})

describe('markSent and markPermanentFailure', () => {
  it('markSent sets sent_at and clears send_error', async () => {
    const [subscriberId] = await seedSubscribers(['alice@example.com'])
    const row = await seedSend(subscriberId, 'post-a', {
      sendError: 'transient',
    })

    await markSent(row.id)

    const [updated] = await fetchSends([row.id])
    expect(updated.sentAt).toBeInstanceOf(Date)
    expect(updated.sendError).toBeNull()
  })

  it('markPermanentFailure sets send_error and increments attempts each call', async () => {
    const [subscriberId] = await seedSubscribers(['alice@example.com'])
    const row = await seedSend(subscriberId, 'post-a')
    expect(row.attempts).toBe(0)

    await markPermanentFailure(row.id, 'mailbox does not exist')
    let [updated] = await fetchSends([row.id])
    expect(updated.sendError).toBe('mailbox does not exist')
    expect(updated.attempts).toBe(1)
    expect(updated.sentAt).toBeNull()

    await markPermanentFailure(row.id, 'still broken')
    ;[updated] = await fetchSends([row.id])
    expect(updated.sendError).toBe('still broken')
    expect(updated.attempts).toBe(2)
  })
})

describe('pendingRowIdsBySlug', () => {
  it('returns only pending rows for the slug, ordered by id ascending', async () => {
    const [aliceId, bobId, carolId, daveId, erinId] = await seedSubscribers([
      'alice@example.com',
      'bob@example.com',
      'carol@example.com',
      'dave@example.com',
      'erin@example.com',
    ])
    const pending1 = await seedSend(aliceId, 'post-a')
    await seedSend(bobId, 'post-a', { sentAt: new Date() })
    await seedSend(carolId, 'post-a', { sendError: 'boom' })
    await seedSend(aliceId, 'post-b')
    const pending2 = await seedSend(daveId, 'post-a')
    const pending3 = await seedSend(erinId, 'post-a')

    const ids = await pendingRowIdsBySlug('post-a')
    expect(ids).toEqual(
      [pending1.id, pending2.id, pending3.id].sort((a, b) => a - b)
    )
  })

  it('returns an empty array when the slug has no rows', async () => {
    await expect(pendingRowIdsBySlug('missing')).resolves.toEqual([])
  })
})

describe('resetFailedBySlug', () => {
  it('clears send_error only on failed-not-sent rows for the slug and reports the count', async () => {
    const [aliceId, bobId, carolId, daveId, erinId] = await seedSubscribers([
      'alice@example.com',
      'bob@example.com',
      'carol@example.com',
      'dave@example.com',
      'erin@example.com',
    ])
    const failed = await seedSend(aliceId, 'post-a', {
      sendError: 'boom',
      attempts: 2,
    })
    const sentClean = await seedSend(bobId, 'post-a', { sentAt: new Date() })
    const pending = await seedSend(carolId, 'post-a')
    const failedOtherSlug = await seedSend(daveId, 'post-b', {
      sendError: 'boom',
    })
    const sentWithError = await seedSend(erinId, 'post-a', {
      sentAt: new Date(),
      sendError: 'late bounce',
    })

    const affected = await resetFailedBySlug('post-a')
    expect(affected).toBe(1)

    const [healed] = await fetchSends([failed.id])
    expect(healed.sendError).toBeNull()
    expect(healed.nextAttemptAt).toBeInstanceOf(Date)
    // attempts is intentionally preserved (the query only clears send_error)
    expect(healed.attempts).toBe(2)

    const [sentRow] = await fetchSends([sentClean.id])
    expect(sentRow.sentAt).toBeInstanceOf(Date)
    expect(sentRow.sendError).toBeNull()

    const [pendingRow] = await fetchSends([pending.id])
    expect(pendingRow.sendError).toBeNull()
    expect(pendingRow.nextAttemptAt).toBeNull()

    const [otherSlugRow] = await fetchSends([failedOtherSlug.id])
    expect(otherSlugRow.sendError).toBe('boom')

    const [sentErrorRow] = await fetchSends([sentWithError.id])
    expect(sentErrorRow.sendError).toBe('late bounce')
    expect(sentErrorRow.sentAt).toBeInstanceOf(Date)
  })

  it('returns 0 when the slug has no failed rows', async () => {
    const [subscriberId] = await seedSubscribers(['alice@example.com'])
    await seedSend(subscriberId, 'post-a')
    await expect(resetFailedBySlug('post-a')).resolves.toBe(0)
  })
})

describe('sendStatsBySlug', () => {
  it('buckets sent, pending, and failed counts for a slug', async () => {
    const [s1, s2, s3, s4, s5, s6, s7] = await seedSubscribers(
      Array.from({ length: 7 }, (_, i) => `stats-${i}@example.com`)
    )
    // post-a: 2 sent, 3 pending, 1 failed, 1 sent-with-error (counts as sent)
    await seedSend(s1, 'post-a', { sentAt: new Date() })
    await seedSend(s2, 'post-a', { sentAt: new Date() })
    await seedSend(s3, 'post-a')
    await seedSend(s4, 'post-a')
    await seedSend(s5, 'post-a')
    await seedSend(s6, 'post-a', { sendError: 'boom' })
    await seedSend(s7, 'post-a', {
      sentAt: new Date(),
      sendError: 'late bounce',
    })
    // noise on another slug
    await seedSend(s1, 'post-b')

    const stats = await sendStatsBySlug('post-a')
    expect(stats).toEqual({ total: 7, sent: 3, pending: 3, failed: 1 })
  })

  it('returns zeros for a slug with no rows', async () => {
    await expect(sendStatsBySlug('missing')).resolves.toEqual({
      total: 0,
      sent: 0,
      pending: 0,
      failed: 0,
    })
  })
})

describe('allSendStats', () => {
  it('groups stats by post slug', async () => {
    const [aliceId, bobId, carolId] = await seedSubscribers([
      'alice@example.com',
      'bob@example.com',
      'carol@example.com',
    ])
    await seedSend(aliceId, 'post-a', { sentAt: new Date() })
    await seedSend(bobId, 'post-a', { sendError: 'boom' })
    await seedSend(carolId, 'post-a')
    await seedSend(aliceId, 'post-b', { sentAt: new Date() })
    await seedSend(bobId, 'post-b', { sentAt: new Date() })

    const stats = await allSendStats()
    expect(Object.keys(stats).sort()).toEqual(['post-a', 'post-b'])
    expect(stats['post-a']).toEqual({
      total: 3,
      sent: 1,
      pending: 1,
      failed: 1,
    })
    expect(stats['post-b']).toEqual({
      total: 2,
      sent: 2,
      pending: 0,
      failed: 0,
    })
  })

  it('returns an empty map when there are no sends', async () => {
    await expect(allSendStats()).resolves.toEqual({})
  })
})

describe('lastCompletedSend', () => {
  it('returns null when nothing has been sent', async () => {
    const [id] = await seedSubscribers(['a@example.com'])
    await seedSend(id, 'queued-only')
    await expect(lastCompletedSend()).resolves.toBeNull()
  })

  it('returns the most recently finished post with its recipient count', async () => {
    const [a, b] = await seedSubscribers(['a@example.com', 'b@example.com'])
    const older = new Date('2026-01-01T00:00:00Z')
    const newer = new Date('2026-02-01T00:00:00Z')
    await seedSend(a, 'old-post', {
      newsletter: 'postcard',
      sentAt: older,
    })
    await seedSend(a, 'new-post', { newsletter: 'workshop', sentAt: older })
    await seedSend(b, 'new-post', { newsletter: 'workshop', sentAt: newer })
    // A pending row for the newest post must not inflate its sent count.
    const [c] = await seedSubscribers(['c@example.com'])
    await seedSend(c, 'new-post', { newsletter: 'workshop' })

    const last = await lastCompletedSend()
    expect(last).not.toBeNull()
    expect(last?.postSlug).toBe('new-post')
    expect(last?.newsletter).toBe('workshop')
    expect(last?.sent).toBe(2)
    expect(last?.lastSentAt).toEqual(newer)
  })
})
