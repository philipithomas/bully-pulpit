import { asc, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('@/lib/email/ses', () =>
  import('@/test/integration/mocks').then((m) => m.sesMock())
)

import { GET } from '@/app/api/cron/suppression-sync/route'
import { cronJobHealth, emailSuppressions } from '@/lib/db/schema'
import { listSuppressedDestinations } from '@/lib/email/ses'
import { db, resetDb } from '@/test/integration/db'

const CRON_SECRET = 'test-cron-secret'
const SES_SOURCE = 'ses_suppression_list'

function request(authorization?: string) {
  return new Request('http://localhost/api/cron/suppression-sync', {
    headers: authorization ? { authorization } : {},
  })
}

function storedSuppressions() {
  return db
    .select()
    .from(emailSuppressions)
    .orderBy(asc(emailSuppressions.email))
}

async function expectHeartbeat(outcome: 'succeeded' | 'failed') {
  expect(await db.select().from(cronJobHealth)).toEqual([
    expect.objectContaining({
      jobName: 'suppression-sync',
      lastStartedAt: expect.any(Date),
      lastSucceededAt: outcome === 'succeeded' ? expect.any(Date) : null,
      lastFailedAt: outcome === 'failed' ? expect.any(Date) : null,
      lastFailureCode: outcome === 'failed' ? 'suppression_sync_failed' : null,
    }),
  ])
}

beforeEach(async () => {
  vi.stubEnv('CRON_SECRET', CRON_SECRET)
  vi.stubEnv('VERCEL_ENV', 'development')
  vi.mocked(listSuppressedDestinations).mockReset().mockResolvedValue([])
  await resetDb()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('GET suppression sync', () => {
  it.each([
    undefined,
    'Bearer wrong-secret',
  ])('rejects unauthorized requests without SES work or heartbeat (%s)', async (authorization) => {
    await db.insert(emailSuppressions).values({
      email: 'existing@example.com',
      reason: 'BOUNCE',
      source: SES_SOURCE,
    })
    const before = await storedSuppressions()

    const response = await GET(request(authorization))

    expect(response.status).toBe(401)
    expect(await response.text()).toBe('Unauthorized')
    expect(listSuppressedDestinations).not.toHaveBeenCalled()
    expect(await storedSuppressions()).toEqual(before)
    expect(await db.select().from(cronJobHealth)).toEqual([])
  })

  it('normalizes and upserts the SES list, pruning only absent SES rows', async () => {
    await db.insert(emailSuppressions).values([
      { email: 'existing@example.com', reason: 'BOUNCE', source: SES_SOURCE },
      { email: 'stale@example.com', reason: 'BOUNCE', source: SES_SOURCE },
      { email: 'manual@example.com', reason: 'COMPLAINT', source: 'manual' },
      { email: 'legacy@example.com', reason: 'BOUNCE', source: null },
    ])
    const before = await storedSuppressions()
    const existing = before.find((row) => row.email === 'existing@example.com')
    const retained = before.filter((row) => row.source !== SES_SOURCE)
    vi.mocked(listSuppressedDestinations).mockResolvedValue([
      { email: 'EXISTING@Example.com', reason: 'COMPLAINT' },
      { email: 'NEW@Example.com', reason: 'BOUNCE' },
    ])

    const response = await GET(request(`Bearer ${CRON_SECRET}`))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ synced: 2, removed: 1 })
    expect(listSuppressedDestinations).toHaveBeenCalledTimes(1)
    expect(await storedSuppressions()).toEqual([
      { ...existing, reason: 'COMPLAINT' },
      ...retained,
      {
        id: expect.any(Number),
        email: 'new@example.com',
        reason: 'BOUNCE',
        source: SES_SOURCE,
        createdAt: expect.any(Date),
      },
    ])
    await expectHeartbeat('succeeded')
  })

  it('keeps one normalized row when duplicate destinations and runs repeat', async () => {
    vi.mocked(listSuppressedDestinations).mockResolvedValue([
      { email: 'READER@Example.com', reason: 'BOUNCE' },
      { email: 'reader@example.com', reason: 'COMPLAINT' },
    ])

    const firstResponse = await GET(request(`Bearer ${CRON_SECRET}`))
    expect(firstResponse.status).toBe(200)
    expect(await firstResponse.json()).toEqual({ synced: 2, removed: 0 })
    const firstRows = await storedSuppressions()
    expect(firstRows).toEqual([
      expect.objectContaining({
        email: 'reader@example.com',
        reason: 'COMPLAINT',
        source: SES_SOURCE,
      }),
    ])

    const repeatedResponse = await GET(request(`Bearer ${CRON_SECRET}`))

    expect(repeatedResponse.status).toBe(200)
    expect(await repeatedResponse.json()).toEqual({ synced: 2, removed: 0 })
    expect(await storedSuppressions()).toEqual(firstRows)
    expect(listSuppressedDestinations).toHaveBeenCalledTimes(2)
    await expectHeartbeat('succeeded')
  })

  it('prunes every SES row on a successful empty list, retaining other sources', async () => {
    await db.insert(emailSuppressions).values([
      { email: 'bounce@example.com', reason: 'BOUNCE', source: SES_SOURCE },
      {
        email: 'complaint@example.com',
        reason: 'COMPLAINT',
        source: SES_SOURCE,
      },
      { email: 'manual@example.com', reason: 'COMPLAINT', source: 'manual' },
      { email: 'legacy@example.com', reason: 'BOUNCE', source: null },
    ])
    const retained = (await storedSuppressions()).filter(
      (row) => row.source !== SES_SOURCE
    )

    const response = await GET(request(`Bearer ${CRON_SECRET}`))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ synced: 0, removed: 2 })
    expect(await storedSuppressions()).toEqual(retained)
    await expectHeartbeat('succeeded')
  })
})

describe('suppression sync failure logging', () => {
  it('logs only the list operation and preserves rows when SES fails', async () => {
    await db.insert(emailSuppressions).values([
      { email: 'reader@example.com', reason: 'BOUNCE', source: SES_SOURCE },
      { email: 'manual@example.com', reason: 'COMPLAINT', source: 'manual' },
    ])
    const before = await storedSuppressions()
    vi.mocked(listSuppressedDestinations).mockRejectedValueOnce(
      Object.assign(new Error('SES failure for reader@example.com'), {
        params: ['reader@example.com'],
        cause: new Error('provider connection string and credentials'),
      })
    )
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET(request(`Bearer ${CRON_SECRET}`))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Sync failed' })
    expect(log.mock.calls).toEqual([
      ['[cron/suppression-sync] failed:', { operation: 'list' }],
    ])
    expect(await storedSuppressions()).toEqual(before)
    await expectHeartbeat('failed')
  })

  it('logs only the upsert operation on a real SQL failure and skips pruning', async () => {
    await db.insert(emailSuppressions).values([
      { email: 'stale@example.com', reason: 'BOUNCE', source: SES_SOURCE },
      { email: 'manual@example.com', reason: 'COMPLAINT', source: 'manual' },
    ])
    const before = await storedSuppressions()
    vi.mocked(listSuppressedDestinations).mockResolvedValue([
      { email: 'private-upsert@example.com', reason: 'BOUNCE' },
    ])
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    await db.execute(sql`
      ALTER TABLE email_suppressions
      ADD CONSTRAINT suppression_sync_upsert_failure
      CHECK (email <> 'private-upsert@example.com')
    `)
    try {
      const response = await GET(request(`Bearer ${CRON_SECRET}`))

      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'Sync failed' })
      expect(log.mock.calls).toEqual([
        ['[cron/suppression-sync] failed:', { operation: 'upsert' }],
      ])
      expect(await storedSuppressions()).toEqual(before)
      await expectHeartbeat('failed')
    } finally {
      await db.execute(sql`
        ALTER TABLE email_suppressions
        DROP CONSTRAINT suppression_sync_upsert_failure
      `)
    }
  })

  it('logs only the prune operation on a real SQL failure and retains stale rows', async () => {
    await db.insert(emailSuppressions).values([
      { email: 'stale@example.com', reason: 'BOUNCE', source: SES_SOURCE },
      { email: 'manual@example.com', reason: 'COMPLAINT', source: 'manual' },
      { email: 'legacy@example.com', reason: 'BOUNCE', source: null },
    ])
    const before = await storedSuppressions()
    vi.mocked(listSuppressedDestinations).mockResolvedValue([
      { email: 'private-prune@example.com', reason: 'BOUNCE' },
    ])
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    // PostgreSQL requires both sides of this foreign key to be non-temporary.
    // The helper exists only in this file's isolated database until finally.
    await db.execute(sql`
      CREATE TABLE suppression_sync_prune_guard (
        email text REFERENCES email_suppressions(email) ON DELETE RESTRICT
      )
    `)
    try {
      await db.execute(sql`
        INSERT INTO suppression_sync_prune_guard (email)
        VALUES ('stale@example.com')
      `)

      const response = await GET(request(`Bearer ${CRON_SECRET}`))

      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'Sync failed' })
      expect(log.mock.calls).toEqual([
        ['[cron/suppression-sync] failed:', { operation: 'prune' }],
      ])
      expect(await storedSuppressions()).toEqual([
        ...before.filter((row) => row.source !== SES_SOURCE),
        {
          id: expect.any(Number),
          email: 'private-prune@example.com',
          reason: 'BOUNCE',
          source: SES_SOURCE,
          createdAt: expect.any(Date),
        },
        before.find((row) => row.email === 'stale@example.com'),
      ])
      await expectHeartbeat('failed')
    } finally {
      await db.execute(sql`DROP TABLE suppression_sync_prune_guard`)
    }
  })
})
