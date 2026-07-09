import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('next/headers', () => import('@/test/integration/session'))
vi.mock('@/lib/email/ses', () =>
  import('@/test/integration/mocks').then((m) => m.sesMock())
)

import { DELETE, GET, PATCH } from '@/app/api/auth/preferences/route'
import { signSession } from '@/lib/auth/jwt'
import { emailSends, logins, subscribers } from '@/lib/db/schema'
import { sendSimpleEmail } from '@/lib/email/ses'
import { db, resetDb } from '@/test/integration/db'
import { clearSessionStore, setSessionCookie } from '@/test/integration/session'

beforeEach(async () => {
  clearSessionStore()
  await resetDb()
  vi.mocked(sendSimpleEmail).mockClear()
})

async function seedSubscriber(
  overrides: Partial<typeof subscribers.$inferInsert> = {}
) {
  const [row] = await db
    .insert(subscribers)
    .values({
      email: 'reader@example.com',
      name: 'Reader',
      confirmedAt: new Date(),
      ...overrides,
    })
    .returning()
  return row
}

async function signIn(subscriber: {
  uuid: string
  email: string
  name: string | null
}) {
  setSessionCookie(await signSession(subscriber))
}

function patchRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/preferences', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('without a session cookie', () => {
  it('GET returns 401', async () => {
    const response = await GET()
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('PATCH returns 401', async () => {
    const response = await PATCH(patchRequest({ subscribed_workshop: false }))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('DELETE returns 401', async () => {
    const response = await DELETE()
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('rejects a forged token (real JWT verification)', async () => {
    setSessionCookie('not-a-real-jwt')
    const response = await GET()
    expect(response.status).toBe(401)
  })
})

describe('GET', () => {
  it('returns the subscriber preferences for a valid session', async () => {
    const subscriber = await seedSubscriber({ subscribedWorkshop: false })
    await signIn(subscriber)

    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      email: 'reader@example.com',
      subscribed_contraption: true,
      subscribed_workshop: false,
      subscribed_postcard: true,
      subscribed_tsundoku: false,
    })
  })

  it('returns 404 when the session subscriber no longer exists', async () => {
    await signIn({
      uuid: '00000000-0000-4000-8000-000000000000',
      email: 'ghost@example.com',
      name: null,
    })

    const response = await GET()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: 'Failed to load preferences',
    })
  })
})

describe('PATCH', () => {
  it('persists a partial preference update without touching other fields', async () => {
    const subscriber = await seedSubscriber()
    await signIn(subscriber)

    const response = await PATCH(patchRequest({ subscribed_workshop: false }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.subscriber).toMatchObject({
      uuid: subscriber.uuid,
      email: 'reader@example.com',
      name: 'Reader',
      subscribed_workshop: false,
      subscribed_contraption: true,
      subscribed_postcard: true,
      subscribed_tsundoku: false,
    })

    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.uuid, subscriber.uuid))
    expect(row.subscribedWorkshop).toBe(false)
    expect(row.subscribedContraption).toBe(true)
    expect(row.subscribedPostcard).toBe(true)
    expect(row.subscribedTsundoku).toBe(false)
    expect(row.name).toBe('Reader')
  })

  it('persists all four onboarding choices in one update', async () => {
    const subscriber = await seedSubscriber({
      subscribedContraption: true,
      subscribedWorkshop: false,
      subscribedPostcard: true,
      subscribedTsundoku: false,
    })
    await signIn(subscriber)

    const response = await PATCH(
      patchRequest({
        subscribed_contraption: false,
        subscribed_workshop: true,
        subscribed_postcard: false,
        subscribed_tsundoku: true,
        analytics_placement: 'onboarding',
      })
    )

    expect(response.status).toBe(200)
    expect((await response.json()).preferences).toEqual({
      email: 'reader@example.com',
      subscribed_contraption: false,
      subscribed_workshop: true,
      subscribed_postcard: false,
      subscribed_tsundoku: true,
    })
    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.uuid, subscriber.uuid))
    expect(row).toMatchObject({
      subscribedContraption: false,
      subscribedWorkshop: true,
      subscribedPostcard: false,
      subscribedTsundoku: true,
    })
  })

  it('notifies the admin when a signed-in subscriber opts into Tsundoku', async () => {
    const subscriber = await seedSubscriber({ subscribedTsundoku: false })
    await signIn(subscriber)

    const response = await PATCH(patchRequest({ subscribed_tsundoku: true }))
    expect(response.status).toBe(200)

    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.uuid, subscriber.uuid))
    expect(row.subscribedTsundoku).toBe(true)

    expect(sendSimpleEmail).toHaveBeenCalledTimes(1)
    const [message] = vi.mocked(sendSimpleEmail).mock.calls[0]
    expect(message.subject).toBe('Tsundoku opt-in: reader@example.com')
    expect(message.html).toContain('Tsundoku opt-in')
    expect(message.html).toContain('reader@example.com')
  })

  it('returns 400 (not 500) for a malformed JSON body', async () => {
    const subscriber = await seedSubscriber()
    await signIn(subscriber)

    const response = await PATCH(
      new Request('http://localhost/api/auth/preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      })
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid request body' })
  })

  it('returns 400 for an unknown key and changes nothing', async () => {
    const subscriber = await seedSubscriber()
    await signIn(subscriber)

    const response = await PATCH(
      patchRequest({ subscribed_workshop: false, role: 'admin' })
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Invalid preferences in request body',
    })

    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.uuid, subscriber.uuid))
    expect(row.subscribedWorkshop).toBe(true)
  })

  it('returns 400 for a non-boolean newsletter flag and changes nothing', async () => {
    const subscriber = await seedSubscriber()
    await signIn(subscriber)

    const response = await PATCH(patchRequest({ subscribed_workshop: 'no' }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Invalid preferences in request body',
    })

    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.uuid, subscriber.uuid))
    expect(row.subscribedWorkshop).toBe(true)
  })
})

describe('DELETE', () => {
  it('removes the subscriber with logins and email_sends, and clears session cookies', async () => {
    const subscriber = await seedSubscriber()
    await db.insert(logins).values({
      subscriberId: subscriber.id,
      token: 'login-token',
      tokenType: 'code',
      expiredAt: new Date(Date.now() + 60_000),
    })
    await db.insert(emailSends).values({
      subscriberId: subscriber.id,
      postSlug: 'some-post',
      newsletter: 'workshop',
    })
    await signIn(subscriber)

    const response = await DELETE()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })

    expect(await db.select().from(subscribers)).toHaveLength(0)
    expect(await db.select().from(logins)).toHaveLength(0)
    expect(await db.select().from(emailSends)).toHaveLength(0)

    const setCookies = response.headers.getSetCookie()
    const token = setCookies.find((c) => c.startsWith('bp_token='))
    const flag = setCookies.find((c) => c.startsWith('bp_has_session='))
    expect(token).toBeDefined()
    expect(flag).toBeDefined()
    // Both cookies are emptied and expired in the past.
    for (const cookie of [token as string, flag as string]) {
      expect(cookie).toMatch(/^bp_(token|has_session)=;/)
      expect(cookie.toLowerCase()).toMatch(/max-age=0|expires=thu, 01 jan 1970/)
    }
  })
})
