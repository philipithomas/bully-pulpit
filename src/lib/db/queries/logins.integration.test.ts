import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isUniqueViolation } from '@/lib/auth/login-service'
import {
  createLogin,
  findValidByToken,
  incrementAttemptsForSubscriber,
  MAX_VERIFICATION_ATTEMPTS,
  markVerified,
} from '@/lib/db/queries/logins'
import { logins, type Subscriber, subscribers } from '@/lib/db/schema'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import { db, resetDb } from '@/test/integration/db'

beforeEach(resetDb)

const inFifteenMinutes = () => new Date(Date.now() + 15 * 60 * 1000)
const oneSecondAgo = () => new Date(Date.now() - 1000)

async function seedSubscriber(email: string): Promise<Subscriber> {
  const [row] = await db.insert(subscribers).values({ email }).returning()
  return row
}

async function loginById(id: number) {
  const rows = await db.select().from(logins).where(eq(logins.id, id))
  return rows[0]
}

describe('findValidByToken', () => {
  it('scopes code tokens to the subscriber they were minted for', async () => {
    const alice = await seedSubscriber('alice@example.com')
    const bob = await seedSubscriber('bob@example.com')
    const login = await createLogin({
      subscriberId: alice.id,
      token: '123456',
      tokenType: 'code',
      expiredAt: inFifteenMinutes(),
    })

    expect(await findValidByToken('123456', 'code', bob.id)).toBeNull()

    const found = await findValidByToken('123456', 'code', alice.id)
    expect(found?.id).toBe(login.id)
    expect(found?.subscriberId).toBe(alice.id)
  })

  it('finds a magic_link token without a subscriberId', async () => {
    const alice = await seedSubscriber('alice@example.com')
    const token = crypto.randomUUID()
    const login = await createLogin({
      subscriberId: alice.id,
      token,
      tokenType: 'magic_link',
      expiredAt: inFifteenMinutes(),
    })

    const found = await findValidByToken(token, 'magic_link')
    expect(found?.id).toBe(login.id)
  })

  it('excludes expired tokens', async () => {
    const alice = await seedSubscriber('alice@example.com')
    await createLogin({
      subscriberId: alice.id,
      token: '654321',
      tokenType: 'code',
      expiredAt: oneSecondAgo(),
    })

    expect(await findValidByToken('654321', 'code', alice.id)).toBeNull()
  })

  it('excludes already-verified tokens', async () => {
    const alice = await seedSubscriber('alice@example.com')
    const login = await createLogin({
      subscriberId: alice.id,
      token: '111222',
      tokenType: 'code',
      expiredAt: inFifteenMinutes(),
    })
    await markVerified(login.id)

    expect(await findValidByToken('111222', 'code', alice.id)).toBeNull()
  })
})

describe('incrementAttemptsForSubscriber', () => {
  it('increments only live code-type rows for that subscriber', async () => {
    const alice = await seedSubscriber('alice@example.com')
    const bob = await seedSubscriber('bob@example.com')

    const liveCode = await createLogin({
      subscriberId: alice.id,
      token: '100001',
      tokenType: 'code',
      expiredAt: inFifteenMinutes(),
    })
    const magicLink = await createLogin({
      subscriberId: alice.id,
      token: crypto.randomUUID(),
      tokenType: 'magic_link',
      expiredAt: inFifteenMinutes(),
    })
    const expiredCode = await createLogin({
      subscriberId: alice.id,
      token: '100002',
      tokenType: 'code',
      expiredAt: oneSecondAgo(),
    })
    const verifiedCode = await createLogin({
      subscriberId: alice.id,
      token: '100003',
      tokenType: 'code',
      expiredAt: inFifteenMinutes(),
    })
    await markVerified(verifiedCode.id)
    const bobCode = await createLogin({
      subscriberId: bob.id,
      token: '100004',
      tokenType: 'code',
      expiredAt: inFifteenMinutes(),
    })

    await incrementAttemptsForSubscriber(alice.id)

    expect((await loginById(liveCode.id)).attempts).toBe(1)
    expect((await loginById(magicLink.id)).attempts).toBe(0)
    expect((await loginById(expiredCode.id)).attempts).toBe(0)
    expect((await loginById(verifiedCode.id)).attempts).toBe(0)
    expect((await loginById(bobCode.id)).attempts).toBe(0)
  })

  it('locks the token at MAX_VERIFICATION_ATTEMPTS and findValidByToken stops returning it', async () => {
    const alice = await seedSubscriber('alice@example.com')
    const login = await createLogin({
      subscriberId: alice.id,
      token: '200001',
      tokenType: 'code',
      expiredAt: inFifteenMinutes(),
    })

    for (let i = 1; i < MAX_VERIFICATION_ATTEMPTS; i++) {
      await incrementAttemptsForSubscriber(alice.id)
    }
    let row = await loginById(login.id)
    expect(row.attempts).toBe(MAX_VERIFICATION_ATTEMPTS - 1)
    expect(row.lockedAt).toBeNull()
    expect(await findValidByToken('200001', 'code', alice.id)).not.toBeNull()

    await incrementAttemptsForSubscriber(alice.id)
    row = await loginById(login.id)
    expect(row.attempts).toBe(MAX_VERIFICATION_ATTEMPTS)
    expect(row.lockedAt).toBeInstanceOf(Date)
    expect(await findValidByToken('200001', 'code', alice.id)).toBeNull()

    // Locked rows are out of the live set: further failures don't touch them.
    await incrementAttemptsForSubscriber(alice.id)
    row = await loginById(login.id)
    expect(row.attempts).toBe(MAX_VERIFICATION_ATTEMPTS)
  })
})

describe('canary: unique violation error shape', () => {
  it('surfaces SQLSTATE 23505 through the cause chain on duplicate token', async () => {
    const alice = await seedSubscriber('alice@example.com')
    await createLogin({
      subscriberId: alice.id,
      token: '999999',
      tokenType: 'code',
      expiredAt: inFifteenMinutes(),
    })

    let caught: unknown
    try {
      await createLogin({
        subscriberId: alice.id,
        token: '999999',
        tokenType: 'code',
        expiredAt: inFifteenMinutes(),
      })
    } catch (err) {
      caught = err
    }

    // The code-collision retry in createCodeLogin depends on this exact shape.
    expect(caught).toBeDefined()
    expect(isUniqueViolation(caught)).toBe(true)
  })

  it('does not flag unrelated errors as unique violations', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
  })
})
