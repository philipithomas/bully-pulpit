import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emailSuppressions, logins, subscribers } from '@/lib/db/schema'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('botid/server', () =>
  import('@/test/integration/mocks').then((m) => m.botidMock())
)
// Mock the SES seam only — @/lib/email/send stays real so templates render.
vi.mock('@/lib/email/ses', () =>
  import('@/test/integration/mocks').then((m) => m.sesMock())
)
// Mock the resolver seam only — @/lib/email/deliverability stays real so the
// MX deliverability check runs its actual logic against canned DNS answers.
vi.mock('node:dns/promises', () => ({
  resolveMx: vi.fn(),
  resolve4: vi.fn(),
  resolve6: vi.fn(),
}))

import { resolve4, resolve6, resolveMx } from 'node:dns/promises'
import { POST } from '@/app/api/subscribe/route'
import { clearDeliverabilityCache } from '@/lib/email/deliverability'
import { sendSimpleEmail } from '@/lib/email/ses'
import { db, resetDb } from '@/test/integration/db'

function subscribeRequest(body: unknown) {
  return new Request('http://localhost/api/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function dnsError(code: string): Error {
  return Object.assign(new Error(`query ${code}`), { code })
}

beforeEach(async () => {
  await resetDb()
  vi.mocked(sendSimpleEmail).mockClear()
  // Default DNS answer: every domain has a working MX record. Tests that
  // exercise the deliverability check override these per domain.
  clearDeliverabilityCache()
  vi.mocked(resolveMx)
    .mockReset()
    .mockResolvedValue([{ exchange: 'mx.example.com', priority: 10 }])
  vi.mocked(resolve4).mockReset().mockRejectedValue(dnsError('ENODATA'))
  vi.mocked(resolve6).mockReset().mockRejectedValue(dnsError('ENODATA'))
})

describe('POST /api/subscribe', () => {
  it('creates the subscriber, mints code + magic-link logins, and emails the code', async () => {
    const res = await POST(
      subscribeRequest({
        email: 'New.Person@Example.COM',
        name: 'New Person',
        source: 'footer',
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      subscriber: {
        uuid: expect.stringMatching(/^[0-9a-f-]{36}$/),
        email: 'new.person@example.com',
        name: 'New Person',
        confirmed_at: null,
        subscribed_postcard: true,
        subscribed_contraption: true,
        subscribed_workshop: true,
        source: 'footer',
        created_at: expect.any(String),
        updated_at: expect.any(String),
      },
    })

    // Subscriber row exists with the normalized email
    const rows = await db.select().from(subscribers)
    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe('new.person@example.com')
    expect(rows[0].confirmedAt).toBeNull()

    // Both login rows: a 6-digit code and a magic link, both marked emailed
    const loginRows = await db
      .select()
      .from(logins)
      .where(eq(logins.subscriberId, rows[0].id))
    expect(loginRows).toHaveLength(2)
    const codeLogin = loginRows.find((l) => l.tokenType === 'code')
    const magicLogin = loginRows.find((l) => l.tokenType === 'magic_link')
    expect(codeLogin).toBeDefined()
    expect(magicLogin).toBeDefined()
    expect(codeLogin?.token).toMatch(/^\d{6}$/)
    expect(magicLogin?.token).toMatch(/^[0-9a-f-]{36}$/)
    expect(codeLogin?.emailSentAt).not.toBeNull()
    expect(magicLogin?.emailSentAt).not.toBeNull()
    expect(codeLogin?.expiredAt.getTime()).toBeGreaterThan(Date.now())

    // Exactly one confirmation email, rendered by the real templates
    expect(sendSimpleEmail).toHaveBeenCalledTimes(1)
    const [message] = vi.mocked(sendSimpleEmail).mock.calls[0]
    expect(message.to).toBe('new.person@example.com')
    expect(message.subject).toBe('Your sign-in code for philipithomas.com')
    expect(message.html).toContain(codeLogin?.token)
    expect(message.text).toContain(codeLogin?.token)
    expect(message.html).toContain(
      `https://www.philipithomas.com/auth/verify?token=${magicLogin?.token}`
    )
  })

  it('applies the newsletters array to the three subscription flags', async () => {
    const res = await POST(
      subscribeRequest({
        email: 'picky@example.com',
        newsletters: ['contraption', 'postcard'],
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.subscriber.subscribed_contraption).toBe(true)
    expect(body.subscriber.subscribed_postcard).toBe(true)
    expect(body.subscriber.subscribed_workshop).toBe(false)

    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, 'picky@example.com'))
    expect(row.subscribedContraption).toBe(true)
    expect(row.subscribedPostcard).toBe(true)
    expect(row.subscribedWorkshop).toBe(false)
  })

  it('rejects a suppressed address with 422 and sends no email', async () => {
    await db
      .insert(emailSuppressions)
      .values({ email: 'blocked@example.com', reason: 'bounce' })

    const res = await POST(subscribeRequest({ email: 'blocked@example.com' }))

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body).toEqual({
      error:
        'We cannot deliver email to this address. Contact mail@philipithomas.com.',
    })
    expect(sendSimpleEmail).not.toHaveBeenCalled()

    // No login rows are minted for a suppressed address...
    const loginRows = await db.select().from(logins)
    expect(loginRows).toHaveLength(0)
    // ...but the subscriber row IS created first: createOrRetrieve inserts
    // before the suppression check throws, and the 422 path does not roll it
    // back. This is the current contract — an unconfirmed row remains.
    const rows = await db.select().from(subscribers)
    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe('blocked@example.com')
    expect(rows[0].confirmedAt).toBeNull()
  })

  it('rejects a domain with no MX and no A/AAAA records with 400, creating nothing', async () => {
    vi.mocked(resolveMx).mockRejectedValue(dnsError('ENOTFOUND'))
    vi.mocked(resolve4).mockRejectedValue(dnsError('ENOTFOUND'))
    vi.mocked(resolve6).mockRejectedValue(dnsError('ENOTFOUND'))

    const res = await POST(subscribeRequest({ email: 'person@gmial.test' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error:
        'That email domain cannot receive mail. Check the address and try again.',
    })
    // The check runs before any DB write or send: no subscriber row, no
    // login rows, no email.
    expect(sendSimpleEmail).not.toHaveBeenCalled()
    expect(await db.select().from(subscribers)).toHaveLength(0)
    expect(await db.select().from(logins)).toHaveLength(0)
  })

  it('proceeds when the DNS lookup itself fails (fail open)', async () => {
    vi.mocked(resolveMx).mockRejectedValue(dnsError('ESERVFAIL'))

    const res = await POST(subscribeRequest({ email: 'person@flaky.test' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.subscriber.email).toBe('person@flaky.test')
    expect(sendSimpleEmail).toHaveBeenCalledTimes(1)

    const rows = await db.select().from(subscribers)
    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe('person@flaky.test')
  })

  it('returns 400 for a malformed email and creates no subscriber', async () => {
    const res = await POST(subscribeRequest({ email: 'not-an-email' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid email address' })
    expect(sendSimpleEmail).not.toHaveBeenCalled()
    expect(await db.select().from(subscribers)).toHaveLength(0)
  })

  it('returns 400 when email is missing entirely', async () => {
    const res = await POST(subscribeRequest({ name: 'No Email' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Email is required' })
    expect(sendSimpleEmail).not.toHaveBeenCalled()
    expect(await db.select().from(subscribers)).toHaveLength(0)
  })
})
