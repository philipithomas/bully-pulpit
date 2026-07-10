import { eq, sql } from 'drizzle-orm'
import { SignJWT } from 'jose'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('next/headers', () => import('@/test/integration/session'))

import { POST as logout } from '@/app/api/auth/logout/route'
import { guardAdmin } from '@/lib/auth/admin'
import { getSession, getSessionClaims, signSession } from '@/lib/auth/jwt'
import { revokeSubscriberSessions } from '@/lib/db/queries/subscribers'
import { subscribers } from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'
import { clearSessionStore, setSessionCookie } from '@/test/integration/session'

beforeEach(async () => {
  clearSessionStore()
  await resetDb()
  process.env.ADMIN_EMAILS = 'admin@example.com'
})

async function seedSubscriber(email = 'reader@example.com') {
  const [subscriber] = await db
    .insert(subscribers)
    .values({ email, name: 'Reader', confirmedAt: new Date() })
    .returning()
  return subscriber
}

describe('subscriber sessions', () => {
  it('uses the current confirmed subscriber row rather than stale token profile data', async () => {
    const subscriber = await seedSubscriber()
    setSessionCookie(await signSession(subscriber))
    await db
      .update(subscribers)
      .set({ name: 'Current name' })
      .where(eq(subscribers.uuid, subscriber.uuid))

    await expect(getSession()).resolves.toEqual({
      uuid: subscriber.uuid,
      email: subscriber.email,
      name: 'Current name',
      sessionVersion: 1,
    })
  })

  it('invalidates outstanding tokens when the subscriber version changes', async () => {
    const subscriber = await seedSubscriber()
    setSessionCookie(await signSession(subscriber))
    expect(await getSession()).not.toBeNull()

    expect(
      await revokeSubscriberSessions(subscriber.uuid, subscriber.sessionVersion)
    ).toBe(true)
    expect(await getSession()).toBeNull()
    await expect(getSessionClaims()).resolves.toMatchObject({
      uuid: subscriber.uuid,
      sessionVersion: 1,
    })
  })

  it('does not let a stale token revoke a newer session on logout', async () => {
    const subscriber = await seedSubscriber()
    const staleToken = await signSession(subscriber)
    expect(
      await revokeSubscriberSessions(subscriber.uuid, subscriber.sessionVersion)
    ).toBe(true)

    const [current] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.uuid, subscriber.uuid))
    expect(current.sessionVersion).toBe(2)
    const currentToken = await signSession(current)

    setSessionCookie(staleToken)
    const response = await logout()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })

    const [afterStaleLogout] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.uuid, subscriber.uuid))
    expect(afterStaleLogout.sessionVersion).toBe(2)

    setSessionCookie(currentToken)
    await expect(getSession()).resolves.toMatchObject({ sessionVersion: 2 })
  })

  it('rejects tokens without the session issuer and audience', async () => {
    const subscriber = await seedSubscriber()
    const token = await new SignJWT({
      email: subscriber.email,
      sessionVersion: subscriber.sessionVersion,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(subscriber.uuid)
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(
        new TextEncoder().encode(process.env.JWT_SECRET ?? 'test-jwt-secret')
      )
    setSessionCookie(token)

    expect(await getSession()).toBeNull()
  })

  it('rejects sessions after confirmation is removed', async () => {
    const subscriber = await seedSubscriber()
    setSessionCookie(await signSession(subscriber))
    await db
      .update(subscribers)
      .set({ confirmedAt: sql`NULL` })
      .where(eq(subscribers.uuid, subscriber.uuid))

    expect(await getSession()).toBeNull()
  })

  it('rechecks the current admin allowlist on every privileged guard', async () => {
    const subscriber = await seedSubscriber('admin@example.com')
    setSessionCookie(await signSession(subscriber))
    expect((await guardAdmin())?.email).toBe('admin@example.com')

    process.env.ADMIN_EMAILS = 'someone-else@example.com'
    expect(await guardAdmin()).toBeNull()
  })
})
