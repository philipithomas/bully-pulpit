import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('next/headers', () => import('@/test/integration/session'))

import { GET } from '@/app/api/auth/me/route'
import { signSession } from '@/lib/auth/jwt'
import { subscribers } from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'
import { clearSessionStore, setSessionCookie } from '@/test/integration/session'

beforeEach(async () => {
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

describe('GET /api/auth/me', () => {
  it('returns an empty auth payload without a session', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ user: null, preferences: null })
    expect(response.headers.getSetCookie()).toHaveLength(0)
  })

  it('returns the signed-in user and newsletter preferences', async () => {
    const subscriber = await seedSubscriber({
      subscribedWorkshop: false,
      subscribedTsundoku: true,
    })
    await signIn(subscriber)

    const response = await GET()

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
        subscribed_tsundoku: true,
      },
    })
  })

  it('clears session cookies when the session subscriber no longer exists', async () => {
    await signIn({
      uuid: '00000000-0000-4000-8000-000000000000',
      email: 'ghost@example.com',
      name: null,
    })

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ user: null, preferences: null })

    const setCookies = response.headers.getSetCookie()
    const token = setCookies.find((c) => c.startsWith('bp_token='))
    const flag = setCookies.find((c) => c.startsWith('bp_has_session='))
    expect(token).toBeDefined()
    expect(flag).toBeDefined()
    for (const cookie of [token as string, flag as string]) {
      expect(cookie).toMatch(/^bp_(token|has_session)=;/)
      expect(cookie.toLowerCase()).toMatch(/max-age=0|expires=thu, 01 jan 1970/)
    }
  })

  it('clears session cookies for an invalid token', async () => {
    setSessionCookie('not-a-real-jwt')

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ user: null, preferences: null })
    expect(response.headers.getSetCookie()).toHaveLength(2)
  })
})
