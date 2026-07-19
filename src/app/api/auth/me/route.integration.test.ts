import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const databaseFault = vi.hoisted(() => ({ unavailable: false }))

vi.mock('@/lib/db/client', async () => {
  const integrationDb = await import('@/test/integration/db')
  return {
    ...integrationDb,
    getDb: () => {
      if (databaseFault.unavailable) throw new Error('database unavailable')
      return integrationDb.db
    },
  }
})
vi.mock('next/headers', () => import('@/test/integration/session'))

import { GET } from '@/app/api/auth/me/route'
import {
  NEW_SUBSCRIBER_ONBOARDING_COOKIE,
  setNewSubscriberOnboardingCookie,
  signSession,
} from '@/lib/auth/jwt'
import { subscribers } from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'
import {
  clearSessionStore,
  setCookie,
  setSessionCookie,
} from '@/test/integration/session'

beforeEach(async () => {
  databaseFault.unavailable = false
  clearSessionStore()
  await resetDb()
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
      subscribedTidbits: true,
      ...overrides,
    })
    .returning()
  return row
}

async function signIn(subscriber: {
  uuid: string
  email: string
  name: string | null
  sessionVersion: number
}) {
  setSessionCookie(await signSession(subscriber))
}

function getMe(consumeOnboarding = false) {
  const url = new URL('http://localhost/api/auth/me')
  if (consumeOnboarding) url.searchParams.set('consume_onboarding', '1')
  return GET(new Request(url))
}

describe('GET /api/auth/me', () => {
  it('returns an empty auth payload without a session', async () => {
    const response = await getMe()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      user: null,
      preferences: null,
      newSubscriberOnboarding: false,
    })
    expect(response.headers.getSetCookie()).toHaveLength(0)
  })

  it('returns the signed-in user and newsletter preferences', async () => {
    const subscriber = await seedSubscriber({
      subscribedWorkshop: false,
      subscribedTsundoku: true,
    })
    await signIn(subscriber)

    const response = await getMe()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      user: {
        uuid: subscriber.uuid,
        email: 'reader@example.com',
        name: 'Reader',
        isAdmin: false,
      },
      preferences: {
        email: 'reader@example.com',
        subscribed_contraption: true,
        subscribed_workshop: false,
        subscribed_postcard: true,
        subscribed_tidbits: true,
      },
      newSubscriberOnboarding: false,
    })
  })

  it('returns and consumes a valid onboarding marker for this subscriber', async () => {
    const subscriber = await seedSubscriber()
    await signIn(subscriber)
    const markerResponse = NextResponse.json({ ok: true })
    await setNewSubscriberOnboardingCookie(markerResponse, subscriber, true)
    setCookie(
      NEW_SUBSCRIBER_ONBOARDING_COOKIE,
      markerResponse.cookies.get(NEW_SUBSCRIBER_ONBOARDING_COOKIE)?.value ?? ''
    )

    const pollingResponse = await getMe()
    expect(await pollingResponse.json()).toMatchObject({
      newSubscriberOnboarding: false,
    })
    expect(pollingResponse.headers.getSetCookie()).toHaveLength(0)

    const response = await getMe(true)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      user: { uuid: subscriber.uuid },
      newSubscriberOnboarding: true,
    })
    const consumed = response.headers
      .getSetCookie()
      .find((cookie) =>
        cookie.startsWith(`${NEW_SUBSCRIBER_ONBOARDING_COOKIE}=`)
      )
    expect(consumed).toMatch(/^__Host-bp_onboarding=;/)
  })

  it('rejects and consumes a marker issued for another subscriber', async () => {
    const subscriber = await seedSubscriber()
    await signIn(subscriber)
    const markerResponse = NextResponse.json({ ok: true })
    await setNewSubscriberOnboardingCookie(
      markerResponse,
      { uuid: '00000000-0000-4000-8000-000000000002' },
      true
    )
    setCookie(
      NEW_SUBSCRIBER_ONBOARDING_COOKIE,
      markerResponse.cookies.get(NEW_SUBSCRIBER_ONBOARDING_COOKIE)?.value ?? ''
    )

    const response = await getMe(true)

    expect(await response.json()).toMatchObject({
      user: { uuid: subscriber.uuid },
      newSubscriberOnboarding: false,
    })
    expect(
      response.headers
        .getSetCookie()
        .some((cookie) =>
          cookie.startsWith(`${NEW_SUBSCRIBER_ONBOARDING_COOKIE}=;`)
        )
    ).toBe(true)
  })

  it('clears session cookies when the session subscriber no longer exists', async () => {
    await signIn({
      uuid: '00000000-0000-4000-8000-000000000000',
      email: 'ghost@example.com',
      name: null,
      sessionVersion: 1,
    })

    const response = await getMe()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      user: null,
      preferences: null,
      newSubscriberOnboarding: false,
    })

    const setCookies = response.headers.getSetCookie()
    const token = setCookies.find((c) => c.startsWith('__Host-bp_token='))
    const flag = setCookies.find((c) => c.startsWith('__Host-bp_has_session='))
    expect(token).toBeDefined()
    expect(flag).toBeDefined()
    for (const cookie of [token as string, flag as string]) {
      expect(cookie).toMatch(/^__Host-bp_(token|has_session)=;/)
      expect(cookie.toLowerCase()).toMatch(/max-age=0|expires=thu, 01 jan 1970/)
    }
  })

  it('clears session cookies for an invalid token', async () => {
    setSessionCookie('not-a-real-jwt')

    const response = await getMe()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      user: null,
      preferences: null,
      newSubscriberOnboarding: false,
    })
    expect(response.headers.getSetCookie()).toHaveLength(6)
  })

  it('clears session cookies when the subscriber session version does not match', async () => {
    const subscriber = await seedSubscriber()
    await signIn({ ...subscriber, sessionVersion: 2 })

    const response = await getMe()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      user: null,
      preferences: null,
      newSubscriberOnboarding: false,
    })
    expect(response.headers.getSetCookie()).toHaveLength(6)
  })

  it('keeps cookies and returns 503 when subscriber state cannot be checked', async () => {
    const subscriber = await seedSubscriber()
    await signIn(subscriber)
    databaseFault.unavailable = true
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await getMe()

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'Authentication is temporarily unavailable',
    })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.getSetCookie()).toHaveLength(0)
    expect(consoleError).toHaveBeenCalledOnce()
    consoleError.mockRestore()
  })
})
