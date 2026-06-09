import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteBySourceNotIn,
  isSuppressed,
  upsertSuppression,
} from '@/lib/db/queries/suppressions'
import { emailSuppressions } from '@/lib/db/schema'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import { db, resetDb } from '@/test/integration/db'

beforeEach(resetDb)

describe('isSuppressed', () => {
  it('matches a lowercase-seeded row when queried with mixed case', async () => {
    await db
      .insert(emailSuppressions)
      .values({ email: 'bounce@example.com', reason: 'bounce' })

    expect(await isSuppressed('BoUnCe@Example.COM')).toBe(true)
  })

  it('matches a mixed-case upsert when queried with lowercase', async () => {
    await upsertSuppression('CoMpLaInT@Example.COM', 'complaint')

    expect(await isSuppressed('complaint@example.com')).toBe(true)

    // The write path normalizes: the stored email is lowercase.
    const rows = await db.select().from(emailSuppressions)
    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe('complaint@example.com')
  })

  it('returns false for an email with no suppression row', async () => {
    await db
      .insert(emailSuppressions)
      .values({ email: 'someone@example.com', reason: 'bounce' })

    expect(await isSuppressed('other@example.com')).toBe(false)
  })
})

describe('upsertSuppression', () => {
  it('inserts a new row with reason and source', async () => {
    await upsertSuppression('new@example.com', 'bounce', 'ses')

    const rows = await db.select().from(emailSuppressions)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      email: 'new@example.com',
      reason: 'bounce',
      source: 'ses',
    })
  })

  it('defaults source to null when omitted', async () => {
    await upsertSuppression('manual@example.com', 'manual')

    const rows = await db.select().from(emailSuppressions)
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBeNull()
  })

  it('updates reason and source on conflict instead of duplicating', async () => {
    await upsertSuppression('dupe@example.com', 'bounce', 'ses')
    // Mixed case hits the same unique email after lowercasing.
    await upsertSuppression('DuPe@Example.COM', 'complaint', 'manual')

    const rows = await db.select().from(emailSuppressions)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      email: 'dupe@example.com',
      reason: 'complaint',
      source: 'manual',
    })
  })

  it('can null out source on upsert', async () => {
    await upsertSuppression('clear@example.com', 'bounce', 'ses')
    await upsertSuppression('clear@example.com', 'bounce')

    const rows = await db.select().from(emailSuppressions)
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBeNull()
  })
})

describe('deleteBySourceNotIn', () => {
  it('deletes unlisted emails for the source, keeping listed ones and other sources', async () => {
    await db.insert(emailSuppressions).values([
      { email: 'keep@example.com', reason: 'bounce', source: 'ses' },
      { email: 'drop@example.com', reason: 'bounce', source: 'ses' },
      { email: 'other-source@example.com', reason: 'bounce', source: 'manual' },
      { email: 'no-source@example.com', reason: 'bounce', source: null },
    ])

    // Mixed-case keep list is lowercased before comparison.
    const deleted = await deleteBySourceNotIn('ses', ['KeEp@Example.COM'])

    expect(deleted).toBe(1)
    const remaining = (await db.select().from(emailSuppressions))
      .map((r) => r.email)
      .sort()
    expect(remaining).toEqual([
      'keep@example.com',
      'no-source@example.com',
      'other-source@example.com',
    ])
  })

  it('wipes the source when the keep-list is empty, leaving other sources untouched', async () => {
    await db.insert(emailSuppressions).values([
      { email: 'a@example.com', reason: 'bounce', source: 'ses' },
      { email: 'b@example.com', reason: 'complaint', source: 'ses' },
      { email: 'c@example.com', reason: 'manual', source: 'manual' },
      { email: 'd@example.com', reason: 'manual', source: null },
    ])

    const deleted = await deleteBySourceNotIn('ses', [])

    expect(deleted).toBe(2)
    const remaining = (await db.select().from(emailSuppressions))
      .map((r) => r.email)
      .sort()
    expect(remaining).toEqual(['c@example.com', 'd@example.com'])
  })

  it('returns 0 when every row for the source is in the keep-list', async () => {
    await db.insert(emailSuppressions).values([
      { email: 'a@example.com', reason: 'bounce', source: 'ses' },
      { email: 'b@example.com', reason: 'bounce', source: 'ses' },
    ])

    const deleted = await deleteBySourceNotIn('ses', [
      'a@example.com',
      'b@example.com',
    ])

    expect(deleted).toBe(0)
    expect(await db.select().from(emailSuppressions)).toHaveLength(2)
  })
})
