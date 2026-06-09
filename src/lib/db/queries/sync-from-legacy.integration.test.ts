import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import {
  type LegacySyncRow,
  syncFromLegacy,
  updateSubscriber,
} from '@/lib/db/queries/subscribers'
import { subscribers } from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'

beforeEach(resetDb)

const T0 = new Date('2024-01-01T00:00:00Z')
const T1 = new Date('2025-06-01T00:00:00Z')
const T2 = new Date('2026-01-01T00:00:00Z')

function legacyRow(overrides: Partial<LegacySyncRow> = {}): LegacySyncRow {
  return {
    uuid: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    email: 'Legacy@Example.com',
    name: 'Legacy Jane',
    confirmedAt: T0,
    subscribedPostcard: true,
    subscribedContraption: false,
    subscribedWorkshop: true,
    source: 'homepage',
    createdAt: T0,
    updatedAt: T1,
    ...overrides,
  }
}

async function row(email: string) {
  const [r] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, email))
  return r
}

describe('syncFromLegacy', () => {
  it('creates rows preserving legacy uuid, timestamps, flags, and source', async () => {
    const result = await syncFromLegacy([legacyRow()])
    expect(result).toEqual({ created: 1, updated: 0, unchanged: 0 })

    const r = await row('legacy@example.com')
    expect(r.uuid).toBe('7c9e6679-7425-40de-944b-e07fc1f90ae7')
    expect(r.name).toBe('Legacy Jane')
    expect(r.confirmedAt).toEqual(T0)
    expect(r.subscribedPostcard).toBe(true)
    expect(r.subscribedContraption).toBe(false)
    expect(r.subscribedWorkshop).toBe(true)
    expect(r.source).toBe('homepage')
    expect(r.createdAt).toEqual(T0)
    expect(r.updatedAt).toEqual(T1)
  })

  it('is idempotent: re-running the same payload changes nothing', async () => {
    await syncFromLegacy([legacyRow()])
    const second = await syncFromLegacy([legacyRow()])
    expect(second).toEqual({ created: 0, updated: 0, unchanged: 1 })

    const third = await syncFromLegacy([legacyRow()])
    expect(third).toEqual({ created: 0, updated: 0, unchanged: 1 })
  })

  it('applies a newer legacy record over an older local row', async () => {
    await syncFromLegacy([legacyRow()])

    const newer = legacyRow({
      name: 'Renamed',
      subscribedPostcard: false,
      updatedAt: T2,
    })
    const result = await syncFromLegacy([newer])
    expect(result).toEqual({ created: 0, updated: 1, unchanged: 0 })

    const r = await row('legacy@example.com')
    expect(r.name).toBe('Renamed')
    expect(r.subscribedPostcard).toBe(false)
    expect(r.updatedAt).toEqual(T2)
  })

  it('does not clobber a local row edited after the legacy snapshot', async () => {
    await syncFromLegacy([legacyRow()])
    const before = await row('legacy@example.com')

    // A real local edit bumps updated_at to now(), which is newer than T1.
    await updateSubscriber(before.uuid, { subscribedWorkshop: false })

    const result = await syncFromLegacy([legacyRow()])
    expect(result).toEqual({ created: 0, updated: 0, unchanged: 1 })

    const r = await row('legacy@example.com')
    expect(r.subscribedWorkshop).toBe(false)
  })

  it('keeps the local uuid when the email already exists', async () => {
    await syncFromLegacy([legacyRow()])
    const existing = await row('legacy@example.com')

    const conflicting = legacyRow({
      uuid: '11111111-2222-4333-8444-555555555555',
      updatedAt: T2,
    })
    await syncFromLegacy([conflicting])

    const r = await row('legacy@example.com')
    expect(r.uuid).toBe(existing.uuid)
  })
})
