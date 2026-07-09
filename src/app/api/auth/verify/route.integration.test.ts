import { and, desc, eq } from 'drizzle-orm'
import { jwtVerify } from 'jose'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('botid/server', () =>
  import('@/test/integration/mocks').then((m) => m.botidMock())
)
vi.mock('@/lib/email/ses', () =>
  import('@/test/integration/mocks').then((m) => m.sesMock())
)
// The subscribe handler checks domain deliverability via DNS before sending.
// Stub the resolver so the test never touches the network: every domain
// resolves to a working MX record.
vi.mock('node:dns/promises', () => ({
  resolveMx: vi.fn(async () => [{ exchange: 'mx.example.com', priority: 10 }]),
  resolve4: vi.fn(async () => []),
  resolve6: vi.fn(async () => []),
}))

import { POST as verifyPost } from '@/app/api/auth/verify/route'
import { POST as subscribePost } from '@/app/api/subscribe/route'
import { GET as verifyMagicLinkGet } from '@/app/auth/verify/route'
import { siteConfig } from '@/lib/config'
import { MAX_VERIFICATION_ATTEMPTS } from '@/lib/db/queries/logins'
import { logins, subscribers } from '@/lib/db/schema'
import { sendSimpleEmail } from '@/lib/email/ses'
import { db, resetDb } from '@/test/integration/db'

const sesSend = vi.mocked(sendSimpleEmail)

function jsonPost(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Runs the real subscribe handler, which mints the code + magic-link logins. */
async function subscribe(
  email: string,
  body: Record<string, unknown> = {}
): Promise<void> {
  const res = await subscribePost(
    jsonPost('http://localhost/api/subscribe', { email, ...body })
  )
  expect(res.status).toBe(200)
}

function verify(email: string, code: string, newsletters?: string[]) {
  return verifyPost(
    jsonPost('http://localhost/api/auth/verify', {
      email,
      code,
      ...(newsletters ? { newsletters } : {}),
    })
  )
}

async function subscriberByEmail(email: string) {
  const rows = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, email))
  expect(rows).toHaveLength(1)
  return rows[0]
}

/** The most recently minted code-type login row for a subscriber. */
async function latestCodeLogin(subscriberId: number) {
  const rows = await db
    .select()
    .from(logins)
    .where(
      and(eq(logins.subscriberId, subscriberId), eq(logins.tokenType, 'code'))
    )
    .orderBy(desc(logins.id))
    .limit(1)
  expect(rows).toHaveLength(1)
  return rows[0]
}

/** The most recently minted magic-link login row for a subscriber. */
async function latestMagicLogin(subscriberId: number) {
  const rows = await db
    .select()
    .from(logins)
    .where(
      and(
        eq(logins.subscriberId, subscriberId),
        eq(logins.tokenType, 'magic_link')
      )
    )
    .orderBy(desc(logins.id))
    .limit(1)
  expect(rows).toHaveLength(1)
  return rows[0]
}

function adminNotificationCalls() {
  return sesSend.mock.calls.filter(([input]) =>
    input.subject.startsWith('New subscriber:')
  )
}

/** A 6-digit code guaranteed not to match (still parses as a code token). */
function wrongCodeFor(code: string): string {
  return code === '000000' ? '000001' : '000000'
}

beforeEach(async () => {
  vi.clearAllMocks()
  await resetDb()
})

describe('POST /api/auth/verify', () => {
  it('completes the OTP loop: confirms, sets session cookies, notifies admin only on first confirmation', async () => {
    await subscribe('reader@example.com')

    // Subscribe sent exactly the confirmation email through the SES seam.
    expect(sesSend).toHaveBeenCalledTimes(1)
    expect(sesSend.mock.calls[0][0].to).toBe('reader@example.com')
    expect(sesSend.mock.calls[0][0].subject).toBe(
      'Confirm your subscription to philipithomas.com'
    )

    const created = await subscriberByEmail('reader@example.com')
    expect(created.confirmedAt).toBeNull()
    const { token: code } = await latestCodeLogin(created.id)
    expect(code).toMatch(/^\d{6}$/)

    const res = await verify('reader@example.com', code)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.email).toBe('reader@example.com')
    expect(body.user.confirmed_at).not.toBeNull()

    // The bp_token cookie carries a real JWT for this subscriber, httpOnly.
    const jwt = res.cookies.get('bp_token')?.value
    expect(jwt).toBeTruthy()
    const { payload } = await jwtVerify(
      jwt as string,
      new TextEncoder().encode(process.env.JWT_SECRET ?? '')
    )
    expect(payload.sub).toBe(created.uuid)
    expect(payload.email).toBe('reader@example.com')
    expect(res.cookies.get('bp_has_session')?.value).toBe('1')
    const setCookie = res.headers.getSetCookie().join('; ')
    expect(setCookie).toContain('bp_token=')
    expect(setCookie).toContain('HttpOnly')

    // DB state: subscriber confirmed, the code login marked verified.
    const confirmed = await subscriberByEmail('reader@example.com')
    expect(confirmed.confirmedAt).not.toBeNull()
    expect((await latestCodeLogin(created.id)).verifiedAt).not.toBeNull()

    // Admin notification fired exactly once, to the site address.
    const firstNotifications = adminNotificationCalls()
    expect(firstNotifications).toHaveLength(1)
    expect(firstNotifications[0][0].to).toBe(siteConfig.sesFromEmail)
    expect(firstNotifications[0][0].subject).toBe(
      'New subscriber: reader@example.com'
    )

    // Sign in again: a fresh code for the now-confirmed subscriber.
    await subscribe('reader@example.com')
    const { token: freshCode } = await latestCodeLogin(created.id)
    // UNIQUE(token) is table-global, so the fresh code cannot equal the old one.
    expect(freshCode).not.toBe(code)

    const res2 = await verify('reader@example.com', freshCode)
    expect(res2.status).toBe(200)

    // ...but no second admin notification for an already-confirmed subscriber.
    expect(adminNotificationCalls()).toHaveLength(1)
  })

  it('returns 400 (not 500) for a malformed JSON body', async () => {
    const res = await verifyPost(
      new Request('http://localhost/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      })
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid request body' })
  })

  it('rejects a wrong code and increments the attempt counter', async () => {
    await subscribe('typo@example.com')
    const sub = await subscriberByEmail('typo@example.com')
    const { token: code } = await latestCodeLogin(sub.id)

    const res = await verify('typo@example.com', wrongCodeFor(code))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid or expired code' })

    const login = await latestCodeLogin(sub.id)
    expect(login.attempts).toBe(1)
    expect(login.lockedAt).toBeNull()
    expect(login.verifiedAt).toBeNull()
    expect((await subscriberByEmail('typo@example.com')).confirmedAt).toBeNull()
  })

  it(`locks the code after ${MAX_VERIFICATION_ATTEMPTS} wrong attempts, rejecting even the correct code`, async () => {
    await subscribe('bruteforce@example.com')
    const sub = await subscriberByEmail('bruteforce@example.com')
    const { token: code } = await latestCodeLogin(sub.id)
    const wrong = wrongCodeFor(code)

    for (let i = 0; i < MAX_VERIFICATION_ATTEMPTS; i++) {
      const res = await verify('bruteforce@example.com', wrong)
      expect(res.status).toBe(400)
    }

    const locked = await latestCodeLogin(sub.id)
    expect(locked.attempts).toBe(MAX_VERIFICATION_ATTEMPTS)
    expect(locked.lockedAt).not.toBeNull()

    // The genuine code is now rejected too.
    const res = await verify('bruteforce@example.com', code)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid or expired code' })

    expect(
      (await subscriberByEmail('bruteforce@example.com')).confirmedAt
    ).toBeNull()
    expect((await latestCodeLogin(sub.id)).verifiedAt).toBeNull()
    expect(adminNotificationCalls()).toHaveLength(0)
  })

  it("rejects subscriber A's code submitted with subscriber B's email", async () => {
    await subscribe('alice@example.com')
    const alice = await subscriberByEmail('alice@example.com')
    const { token: aliceCode } = await latestCodeLogin(alice.id)

    await db.insert(subscribers).values({ email: 'bob@example.com' })

    const res = await verify('bob@example.com', aliceCode)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid or expired code' })

    // Alice's code is untouched (still live, attempts only count against Bob),
    // and nobody got confirmed.
    const aliceLogin = await latestCodeLogin(alice.id)
    expect(aliceLogin.verifiedAt).toBeNull()
    expect(aliceLogin.attempts).toBe(0)
    expect(
      (await subscriberByEmail('alice@example.com')).confirmedAt
    ).toBeNull()
    expect((await subscriberByEmail('bob@example.com')).confirmedAt).toBeNull()
  })

  it('applies requested newsletter opt-ins after a code sign-in', async () => {
    await db.insert(subscribers).values({
      email: 'workshop-reader@example.com',
      confirmedAt: new Date(),
      subscribedContraption: false,
      subscribedWorkshop: false,
      subscribedPostcard: false,
      subscribedTsundoku: false,
    })

    await subscribe('workshop-reader@example.com', {
      newsletters: ['workshop'],
    })

    const before = await subscriberByEmail('workshop-reader@example.com')
    expect(before.subscribedWorkshop).toBe(false)
    const { token: code } = await latestCodeLogin(before.id)

    const res = await verify('workshop-reader@example.com', code, ['workshop'])
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.subscribed_workshop).toBe(true)

    const after = await subscriberByEmail('workshop-reader@example.com')
    expect(after.subscribedContraption).toBe(false)
    expect(after.subscribedWorkshop).toBe(true)
    expect(after.subscribedPostcard).toBe(false)
    expect(after.subscribedTsundoku).toBe(false)
    expect(adminNotificationCalls()).toHaveLength(0)
  })

  it('applies requested newsletter opt-ins from a magic-link sign-in', async () => {
    await db.insert(subscribers).values({
      email: 'contraption-reader@example.com',
      confirmedAt: new Date(),
      subscribedContraption: false,
      subscribedWorkshop: false,
      subscribedPostcard: false,
      subscribedTsundoku: false,
    })

    await subscribe('contraption-reader@example.com', {
      newsletters: ['contraption'],
    })

    const before = await subscriberByEmail('contraption-reader@example.com')
    expect(before.subscribedContraption).toBe(false)
    const { token } = await latestMagicLogin(before.id)

    const res = await verifyMagicLinkGet(
      new NextRequest(
        `https://www.philipithomas.com/auth/verify?token=${token}&newsletter=contraption`
      )
    )
    expect(res.headers.get('location')).toBe(
      'https://www.philipithomas.com/?signed-in=1&analytics-signup=email-link&analytics-newsletter=contraption&analytics-new-subscriber=0'
    )
    expect(res.cookies.get('bp_has_session')?.value).toBe('1')

    const after = await subscriberByEmail('contraption-reader@example.com')
    expect(after.subscribedContraption).toBe(true)
    expect(after.subscribedWorkshop).toBe(false)
    expect(after.subscribedPostcard).toBe(false)
    expect(after.subscribedTsundoku).toBe(false)
    expect(adminNotificationCalls()).toHaveLength(0)
  })
})
