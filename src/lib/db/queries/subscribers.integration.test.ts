import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  emailSends,
  logins,
  smsSubscribers,
  subscribers,
} from '@/lib/db/schema'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import {
  countActive,
  countEligible,
  createSubscriber,
  deleteWithData,
  findByEmail,
  findEligibleIds,
  importSubscribers,
  listSubscribers,
  subscriberStats,
  updateSubscriber,
} from '@/lib/db/queries/subscribers'
import { db, resetDb } from '@/test/integration/db'

beforeEach(resetDb)

/** Direct insert for seeding rows the public API can't create (flags, confirmedAt). */
async function seed(values: Partial<typeof subscribers.$inferInsert> = {}) {
  const [row] = await db
    .insert(subscribers)
    .values({ email: `seed-${crypto.randomUUID()}@example.com`, ...values })
    .returning()
  return row
}

describe('createSubscriber / findByEmail / updateSubscriber', () => {
  it('lowercases the email and applies generated defaults', async () => {
    const created = await createSubscriber({
      email: 'MiXeD.Case@Example.COM',
      name: 'Ada Lovelace',
      source: 'test',
    })
    expect(created.email).toBe('mixed.case@example.com')
    expect(created.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
    expect(created.name).toBe('Ada Lovelace')
    expect(created.source).toBe('test')
    expect(created.confirmedAt).toBeNull()
    // Standing newsletter flags default to opted-in. Tsundoku is opt-in only.
    expect(created.subscribedPostcard).toBe(true)
    expect(created.subscribedContraption).toBe(true)
    expect(created.subscribedWorkshop).toBe(true)
    expect(created.subscribedTsundoku).toBe(false)
  })

  it('findByEmail lowercases its argument and round-trips', async () => {
    const created = await createSubscriber({ email: 'Round.Trip@Example.com' })
    const found = await findByEmail('ROUND.TRIP@EXAMPLE.COM')
    expect(found).not.toBeNull()
    expect(found?.id).toBe(created.id)
    expect(found?.uuid).toBe(created.uuid)
    expect(await findByEmail('nobody@example.com')).toBeNull()
  })

  it('updateSubscriber changes only the provided fields', async () => {
    const created = await createSubscriber({
      email: 'partial@example.com',
      name: 'Original Name',
    })

    const updated = await updateSubscriber(created.uuid, {
      subscribedContraption: false,
    })
    expect(updated?.subscribedContraption).toBe(false)
    // omitted fields untouched
    expect(updated?.name).toBe('Original Name')
    expect(updated?.subscribedPostcard).toBe(true)
    expect(updated?.subscribedWorkshop).toBe(true)

    // an explicit null name IS provided and clears the field
    const cleared = await updateSubscriber(created.uuid, { name: null })
    expect(cleared?.name).toBeNull()
    expect(cleared?.subscribedContraption).toBe(false)

    expect(
      await updateSubscriber(crypto.randomUUID(), { name: 'x' })
    ).toBeNull()
  })
})

describe('subscriberStats / countActive', () => {
  it('aggregates the FILTER counts against mixed data', async () => {
    const confirmedAt = new Date()
    // confirmed, all standing newsletters plus Tsundoku
    await seed({ confirmedAt, subscribedTsundoku: true })
    // confirmed, contraption only
    await seed({
      confirmedAt,
      subscribedPostcard: false,
      subscribedWorkshop: false,
    })
    // unconfirmed, all flags on — counts toward total only
    await seed()
    // confirmed but opted out of everything
    await seed({
      confirmedAt,
      subscribedPostcard: false,
      subscribedContraption: false,
      subscribedWorkshop: false,
    })

    expect(await subscriberStats()).toEqual({
      total: 4,
      confirmed: 3,
      postcard: 1,
      contraption: 2,
      workshop: 1,
      tsundoku: 1,
    })
    // active = confirmed AND at least one newsletter
    expect(await countActive()).toBe(2)
  })

  it('includes active SMS subscribers in the public count', async () => {
    const confirmedAt = new Date()
    await seed({ confirmedAt })
    await db.insert(smsSubscribers).values([
      {
        phoneNumber: '+15551230001',
        confirmedAt,
      },
      {
        phoneNumber: '+15551230002',
      },
      {
        phoneNumber: '+15551230003',
        confirmedAt,
        subscribedPostcard: false,
        subscribedContraption: false,
        subscribedWorkshop: false,
        subscribedTsundoku: false,
      },
    ])

    expect(await countActive()).toBe(2)
  })

  it('returns zeros on an empty table', async () => {
    expect(await subscriberStats()).toEqual({
      total: 0,
      confirmed: 0,
      postcard: 0,
      contraption: 0,
      workshop: 0,
      tsundoku: 0,
    })
    expect(await countActive()).toBe(0)
  })
})

describe('eligibility (findEligibleIds / countEligible)', () => {
  const slug = 'some-post'

  it('requires confirmed and opted into the newsletter', async () => {
    const eligible = await seed({ confirmedAt: new Date() })
    await seed() // unconfirmed
    await seed({ confirmedAt: new Date(), subscribedContraption: false })

    expect(await findEligibleIds('contraption', slug)).toEqual([eligible.id])
    expect(await countEligible('contraption', slug)).toBe(1)
  })

  it('a SENT row and a PENDING row both block; a different slug does not', async () => {
    const sent = await seed({ confirmedAt: new Date() })
    const pending = await seed({ confirmedAt: new Date() })
    const otherSlug = await seed({ confirmedAt: new Date() })
    await db.insert(emailSends).values([
      { subscriberId: sent.id, postSlug: slug, sentAt: new Date() },
      { subscriberId: pending.id, postSlug: slug }, // queued: no sentAt, no error
      {
        subscriberId: otherSlug.id,
        postSlug: 'another-post',
        sentAt: new Date(),
      },
    ])

    expect(await findEligibleIds('contraption', slug)).toEqual([otherSlug.id])
    expect(await countEligible('contraption', slug)).toBe(1)
  })

  it('an ERRORED row (send_error set, sent_at null) does NOT block — self-heal divergence', async () => {
    const errored = await seed({ confirmedAt: new Date() })
    await db.insert(emailSends).values({
      subscriberId: errored.id,
      postSlug: slug,
      sendError: 'SES throttled',
    })

    expect(await findEligibleIds('contraption', slug)).toEqual([errored.id])
    expect(await countEligible('contraption', slug)).toBe(1)
  })
})

describe('deleteWithData', () => {
  it('removes the subscriber, logins, and email_sends in one CTE; other rows survive', async () => {
    const doomed = await seed()
    const keeper = await seed()
    await db.insert(logins).values([
      {
        subscriberId: doomed.id,
        token: 'doomed-token',
        tokenType: 'code',
        expiredAt: new Date(),
      },
      {
        subscriberId: keeper.id,
        token: 'keeper-token',
        tokenType: 'magic_link',
        expiredAt: new Date(),
      },
    ])
    await db.insert(emailSends).values([
      { subscriberId: doomed.id, postSlug: 'a-post' },
      { subscriberId: keeper.id, postSlug: 'a-post' },
    ])

    await deleteWithData(doomed.id)

    const remainingSubscribers = await db.select().from(subscribers)
    expect(remainingSubscribers.map((s) => s.id)).toEqual([keeper.id])

    const remainingLogins = await db.select().from(logins)
    expect(remainingLogins).toHaveLength(1)
    expect(remainingLogins[0].subscriberId).toBe(keeper.id)

    const remainingSends = await db.select().from(emailSends)
    expect(remainingSends).toHaveLength(1)
    expect(remainingSends[0].subscriberId).toBe(keeper.id)
  })
})

describe('importSubscribers', () => {
  const row = (
    email: string,
    overrides: Partial<Parameters<typeof importSubscribers>[0][number]> = {}
  ) => ({
    email,
    name: null,
    postcard: true,
    contraption: true,
    workshop: true,
    tsundoku: true,
    confirmed: true,
    source: null,
    ...overrides,
  })
  const allPresent = {
    postcard: true,
    contraption: true,
    workshop: true,
    tsundoku: true,
    confirmed: true,
  }
  const nonePresent = {
    postcard: false,
    contraption: false,
    workshop: false,
    tsundoku: false,
    confirmed: false,
  }

  it('counts created vs updated via xmax and lowercases emails', async () => {
    const first = await importSubscribers(
      [row('One@Example.com'), row('two@example.com')],
      allPresent
    )
    expect(first).toEqual({ created: 2, updated: 0 })
    expect(await findByEmail('one@example.com')).not.toBeNull()

    const second = await importSubscribers(
      [
        row('ONE@example.com'),
        row('two@example.com'),
        row('three@example.com'),
      ],
      allPresent
    )
    expect(second).toEqual({ created: 1, updated: 2 })
  })

  it('with flag columns ABSENT, defaults apply only to NEW rows; opt-outs survive', async () => {
    // existing subscriber who opted out of contraption and never confirmed
    await seed({
      email: 'veteran@example.com',
      subscribedContraption: false,
    })

    // the import route fills true for every absent column, present=false
    const result = await importSubscribers(
      [row('veteran@example.com'), row('fresh@example.com')],
      nonePresent
    )
    expect(result).toEqual({ created: 1, updated: 1 })

    const veteran = await findByEmail('veteran@example.com')
    expect(veteran?.subscribedContraption).toBe(false) // NOT re-subscribed
    expect(veteran?.subscribedPostcard).toBe(true)
    expect(veteran?.subscribedTsundoku).toBe(false)
    expect(veteran?.confirmedAt).toBeNull() // absent confirmed column can't confirm

    const fresh = await findByEmail('fresh@example.com')
    expect(fresh?.subscribedPostcard).toBe(true)
    expect(fresh?.subscribedContraption).toBe(true)
    expect(fresh?.subscribedWorkshop).toBe(true)
    expect(fresh?.subscribedTsundoku).toBe(true)
    expect(fresh?.confirmedAt).not.toBeNull()
    expect(fresh?.source).toBe('csv_import')
  })

  it('with flag columns PRESENT, the import overwrites existing flags both ways', async () => {
    await seed({
      email: 'flip@example.com',
      subscribedContraption: false,
      subscribedWorkshop: true,
    })

    await importSubscribers(
      [row('flip@example.com', { contraption: true, workshop: false })],
      allPresent
    )

    const flipped = await findByEmail('flip@example.com')
    expect(flipped?.subscribedContraption).toBe(true)
    expect(flipped?.subscribedWorkshop).toBe(false)
    expect(flipped?.subscribedTsundoku).toBe(true)
  })

  it('confirmed is monotonic: an import can confirm but never un-confirm', async () => {
    const originallyConfirmedAt = new Date('2025-01-15T12:00:00Z')
    await seed({
      email: 'already@example.com',
      confirmedAt: originallyConfirmedAt,
    })
    await seed({ email: 'pending@example.com' })

    await importSubscribers(
      [
        row('already@example.com', { confirmed: false }),
        row('pending@example.com', { confirmed: true }),
      ],
      allPresent
    )

    const already = await findByEmail('already@example.com')
    // COALESCE keeps the original timestamp, not null and not a new date
    expect(already?.confirmedAt?.getTime()).toBe(
      originallyConfirmedAt.getTime()
    )

    const pending = await findByEmail('pending@example.com')
    expect(pending?.confirmedAt).not.toBeNull()
  })

  it('name COALESCE: a null import name keeps the existing one, a value replaces it', async () => {
    await seed({ email: 'named@example.com', name: 'Existing Name' })

    await importSubscribers([row('named@example.com')], allPresent)
    expect((await findByEmail('named@example.com'))?.name).toBe('Existing Name')

    await importSubscribers(
      [row('named@example.com', { name: 'New Name' })],
      allPresent
    )
    expect((await findByEmail('named@example.com'))?.name).toBe('New Name')
  })

  it('new rows take the CSV source, falling back to csv_import', async () => {
    await importSubscribers(
      [
        row('attributed@example.com', { source: 'https://example.org/' }),
        row('plain@example.com'),
      ],
      allPresent
    )

    expect((await findByEmail('attributed@example.com'))?.source).toBe(
      'https://example.org/'
    )
    expect((await findByEmail('plain@example.com'))?.source).toBe('csv_import')
  })

  it('backfills source over NULL and the csv_import placeholder', async () => {
    await seed({ email: 'null-source@example.com', source: null })
    await seed({ email: 'placeholder@example.com', source: 'csv_import' })

    await importSubscribers(
      [
        row('null-source@example.com', { source: 'https://example.org/' }),
        row('placeholder@example.com', { source: 'https://example.net/' }),
      ],
      allPresent
    )

    expect((await findByEmail('null-source@example.com'))?.source).toBe(
      'https://example.org/'
    )
    expect((await findByEmail('placeholder@example.com'))?.source).toBe(
      'https://example.net/'
    )
  })

  it('never overwrites a real captured referrer', async () => {
    await seed({
      email: 'captured@example.com',
      source: 'https://news.ycombinator.com/',
    })

    await importSubscribers(
      [row('captured@example.com', { source: 'https://example.org/' })],
      allPresent
    )

    expect((await findByEmail('captured@example.com'))?.source).toBe(
      'https://news.ycombinator.com/'
    )
  })

  it('a source-less import leaves existing sources untouched', async () => {
    await seed({ email: 'null-source@example.com', source: null })
    await seed({ email: 'placeholder@example.com', source: 'csv_import' })
    await seed({
      email: 'captured@example.com',
      source: 'https://news.ycombinator.com/',
    })

    await importSubscribers(
      [
        row('null-source@example.com'),
        row('placeholder@example.com'),
        row('captured@example.com'),
      ],
      nonePresent
    )

    expect((await findByEmail('null-source@example.com'))?.source).toBeNull()
    expect((await findByEmail('placeholder@example.com'))?.source).toBe(
      'csv_import'
    )
    expect((await findByEmail('captured@example.com'))?.source).toBe(
      'https://news.ycombinator.com/'
    )
  })

  it('a bare email,source backfill cannot touch flags, names, or confirmation', async () => {
    await seed({
      email: 'optout@example.com',
      name: 'Existing Name',
      subscribedPostcard: false,
      subscribedContraption: false,
      subscribedWorkshop: false,
      subscribedTsundoku: true,
      source: 'csv_import',
    })

    // The import route maps a bare email,source file to defaults (true) for
    // every flag with present=false, mirroring the bare-email-list case.
    await importSubscribers(
      [row('optout@example.com', { source: 'https://example.org/' })],
      nonePresent
    )

    const optout = await findByEmail('optout@example.com')
    expect(optout?.source).toBe('https://example.org/') // backfilled
    expect(optout?.name).toBe('Existing Name')
    expect(optout?.subscribedPostcard).toBe(false) // opt-outs survive
    expect(optout?.subscribedContraption).toBe(false)
    expect(optout?.subscribedWorkshop).toBe(false)
    expect(optout?.subscribedTsundoku).toBe(true)
    expect(optout?.confirmedAt).toBeNull() // absent confirmed column can't confirm
  })
})

describe('listSubscribers', () => {
  it('search matches an email substring case-insensitively', async () => {
    await seed({ email: 'alice@example.com' })
    await seed({ email: 'bob@test.org' })
    await seed({ email: 'carol@example.com' })

    const byDomain = await listSubscribers({ search: ' EXAMPLE.com ' })
    expect(byDomain.total).toBe(2)
    expect(byDomain.rows.map((r) => r.email).sort()).toEqual([
      'alice@example.com',
      'carol@example.com',
    ])

    const byLocal = await listSubscribers({ search: 'bob' })
    expect(byLocal.total).toBe(1)
    expect(byLocal.rows[0].email).toBe('bob@test.org')

    const miss = await listSubscribers({ search: 'zelda' })
    expect(miss.total).toBe(0)
    expect(miss.rows).toEqual([])
  })

  it('filters by newsletter and combines with search', async () => {
    await seed({
      email: 'alice@example.com',
      subscribedTsundoku: true,
    })
    await seed({
      email: 'bob@example.com',
      subscribedTsundoku: false,
    })
    await seed({
      email: 'carol@other.org',
      subscribedTsundoku: true,
    })

    const tsundoku = await listSubscribers({ newsletter: 'tsundoku' })
    expect(tsundoku.total).toBe(2)
    expect(tsundoku.rows.map((r) => r.email)).toEqual([
      'carol@other.org',
      'alice@example.com',
    ])

    const searched = await listSubscribers({
      newsletter: 'tsundoku',
      search: 'example.com',
    })
    expect(searched.total).toBe(1)
    expect(searched.rows[0].email).toBe('alice@example.com')
  })

  it('offset paging is stable when created_at ties (id tiebreaker)', async () => {
    // CSV imports share one NOW(); simulate with an identical createdAt
    const createdAt = new Date('2026-01-01T00:00:00Z')
    const seeded = []
    for (let i = 1; i <= 5; i += 1) {
      seeded.push(await seed({ email: `tie-${i}@example.com`, createdAt }))
    }

    const pages = []
    for (const offset of [0, 2, 4]) {
      const page = await listSubscribers({ limit: 2, offset })
      expect(page.total).toBe(5)
      pages.push(...page.rows)
    }

    // newest id first, no row skipped or duplicated across page boundaries
    expect(pages.map((r) => r.email)).toEqual([
      'tie-5@example.com',
      'tie-4@example.com',
      'tie-3@example.com',
      'tie-2@example.com',
      'tie-1@example.com',
    ])
    expect(new Set(pages.map((r) => r.uuid)).size).toBe(5)

    // sanity: the rows really do share created_at, so the tiebreaker did the work
    const distinctCreatedAt = await db
      .select({ createdAt: subscribers.createdAt })
      .from(subscribers)
      .where(eq(subscribers.createdAt, createdAt))
    expect(distinctCreatedAt).toHaveLength(5)
  })
})
