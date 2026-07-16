import { checkBotId } from 'botid/server'
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
import { POST as POST_TSUNDOKU } from '@/app/api/subscribe/tsundoku/route'
import { POST as POST_UMAMI } from '@/app/api/subscribe/umami/route'
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
  vi.mocked(checkBotId).mockClear()
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
  it('rejects non-JSON and oversized bodies before BotID or database work', async () => {
    const wrongType = await POST(
      new Request('http://localhost/api/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ email: 'reader@example.com' }),
      })
    )
    expect(wrongType.status).toBe(415)

    const oversized = await POST(
      subscribeRequest({
        email: 'reader@example.com',
        source: 'x'.repeat(20_000),
      })
    )
    expect(oversized.status).toBe(413)

    const missingEmail = await POST(subscribeRequest({}))
    expect(missingEmail.status).toBe(400)
    expect(await missingEmail.json()).toEqual({ error: 'Email is required' })
    expect(checkBotId).not.toHaveBeenCalled()
    expect(await db.select().from(subscribers)).toEqual([])
  })

  it('creates the subscriber, mints code + magic-link logins, and emails the code', async () => {
    const res = await POST(
      subscribeRequest({
        email: 'New.Person@Example.COM',
        name: 'New Person',
        source: 'footer',
      })
    )

    expect(res.status).toBe(200)
    // The unauthenticated response carries no subscriber data.
    expect(await res.json()).toEqual({
      ok: true,
      status: 'verification_sent',
    })

    // Subscriber row exists with the normalized email, name, and source
    const rows = await db.select().from(subscribers)
    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe('new.person@example.com')
    expect(rows[0].name).toBe('New Person')
    expect(rows[0].source).toBe('footer')
    expect(rows[0].confirmedAt).toBeNull()
    // Every new public signup starts on newsletters accepting subscriptions.
    expect(rows[0].subscribedContraption).toBe(true)
    expect(rows[0].subscribedWorkshop).toBe(true)
    expect(rows[0].subscribedPostcard).toBe(true)
    expect(rows[0].subscribedTsundoku).toBe(false)
    expect(rows[0].subscribedUmami).toBe(true)

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
    expect(codeLogin?.token).not.toBe('000000')
    expect(magicLogin?.token).toMatch(/^[0-9a-f-]{36}$/)
    expect(codeLogin?.emailSentAt).not.toBeNull()
    expect(magicLogin?.emailSentAt).not.toBeNull()
    expect(codeLogin?.expiredAt.getTime()).toBeGreaterThan(Date.now())

    // Exactly one confirmation email, rendered by the real templates. A NEW
    // subscriber gets the confirmation copy, not the sign-in copy.
    expect(sendSimpleEmail).toHaveBeenCalledTimes(1)
    const [message] = vi.mocked(sendSimpleEmail).mock.calls[0]
    expect(message.to).toBe('new.person@example.com')
    expect(message.subject).toBe(
      'Confirm your subscription to philipithomas.com'
    )
    expect(message.html).toContain(
      'Thanks for subscribing to Contraption, Workshop, Postcard, and umami at'
    )
    expect(message.text).toContain(
      'Thanks for subscribing to Contraption, Workshop, Postcard, and umami at philipithomas.com.'
    )
    expect(message.html).toContain(codeLogin?.token)
    expect(message.text).toContain(codeLogin?.token)
    expect(message.html).toContain(
      `https://www.philipithomas.com/auth/verify?token=${magicLogin?.token}`
    )
  })

  it('reserves 000000 even when the random source returns zero', async () => {
    const random = vi
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation((array) => {
        if (array instanceof Uint32Array) array.fill(0)
        return array
      })

    try {
      const response = await POST(
        subscribeRequest({ email: 'zero-random@example.com' })
      )
      expect(response.status).toBe(200)

      const [subscriber] = await db
        .select()
        .from(subscribers)
        .where(eq(subscribers.email, 'zero-random@example.com'))
      const loginRows = await db
        .select()
        .from(logins)
        .where(eq(logins.subscriberId, subscriber.id))
      const codeLogin = loginRows.find((login) => login.tokenType === 'code')

      expect(codeLogin?.token).toBe('000001')
    } finally {
      random.mockRestore()
    }
  })

  it('ignores an inactive focused newsletter and applies active defaults to a new subscriber', async () => {
    const res = await POST(
      subscribeRequest({
        email: 'picky@example.com',
        source: null,
        newsletters: ['tsundoku'],
      })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      status: 'verification_sent',
    })

    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, 'picky@example.com'))
    expect(row.subscribedContraption).toBe(true)
    expect(row.subscribedPostcard).toBe(true)
    expect(row.subscribedWorkshop).toBe(true)
    expect(row.subscribedTsundoku).toBe(false)
    expect(row.subscribedUmami).toBe(true)
    expect(row.source).toBeNull()

    // New subscribers get the full list in their confirmation email.
    const [message] = vi.mocked(sendSimpleEmail).mock.calls[0]
    expect(message.subject).toBe(
      'Confirm your subscription to philipithomas.com'
    )
    expect(message.text).toContain(
      'Thanks for subscribing to Contraption, Workshop, Postcard, and umami at philipithomas.com.'
    )
  })

  it('opts an existing subscriber into explicitly requested newsletters without rewriting identity fields', async () => {
    await db.insert(subscribers).values({
      email: 'returning@example.com',
      name: 'Original Name',
      source: 'https://news.ycombinator.com',
      subscribedContraption: true,
      subscribedWorkshop: false,
      subscribedPostcard: false,
      subscribedTsundoku: false,
      subscribedUmami: false,
    })

    // Requested newsletter flags opt in, while name and source remain untouched.
    const res = await POST(
      subscribeRequest({
        email: 'returning@example.com',
        name: 'Imposter Name',
        source: 'https://www.google.com',
        newsletters: ['contraption', 'workshop', 'postcard'],
      })
    )
    expect(res.status).toBe(200)
    // The unconfirmed row still needs verification, and the response carries
    // no subscriber data.
    expect(await res.json()).toEqual({
      ok: true,
      status: 'verification_sent',
    })

    const rows = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, 'returning@example.com'))
    expect(rows).toHaveLength(1)
    expect(rows[0].subscribedContraption).toBe(true)
    expect(rows[0].subscribedWorkshop).toBe(true)
    expect(rows[0].subscribedPostcard).toBe(true)
    expect(rows[0].subscribedTsundoku).toBe(false)
    expect(rows[0].subscribedUmami).toBe(false)
    expect(rows[0].name).toBe('Original Name')
    expect(rows[0].source).toBe('https://news.ycombinator.com')

    // The subscriber is still unconfirmed, so the email keeps the confirmation
    // copy and names only the newsletters the stored row opts into.
    expect(sendSimpleEmail).toHaveBeenCalledTimes(1)
    const [resend] = vi.mocked(sendSimpleEmail).mock.calls[0]
    expect(resend.subject).toBe(
      'Confirm your subscription to philipithomas.com'
    )
    expect(resend.text).toContain(
      'Thanks for subscribing to Contraption, Workshop, and Postcard at philipithomas.com.'
    )
  })

  it('signs in an existing confirmed subscriber without re-subscribing them when no newsletters are requested', async () => {
    await db.insert(subscribers).values({
      email: 'opteddown@example.com',
      name: 'Opted Down',
      source: 'https://original.example',
      confirmedAt: new Date(),
      subscribedContraption: false,
      subscribedWorkshop: false,
      subscribedPostcard: false,
      subscribedUmami: false,
    })

    const res = await POST(
      subscribeRequest({
        email: 'opteddown@example.com',
        name: 'Overwrite Attempt',
        source: 'https://www.google.com',
      })
    )

    expect(res.status).toBe(200)
    // No subscriber data in the response: nothing distinguishes this from a
    // brand-new email, and nothing leaks the stored row.
    expect(await res.json()).toEqual({
      ok: true,
      status: 'verification_sent',
    })

    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, 'opteddown@example.com'))
    expect(row.subscribedContraption).toBe(false)
    expect(row.subscribedWorkshop).toBe(false)
    expect(row.subscribedPostcard).toBe(false)
    expect(row.subscribedTsundoku).toBe(false)
    expect(row.subscribedUmami).toBe(false)
    expect(row.name).toBe('Opted Down')
    expect(row.source).toBe('https://original.example')

    // The sign-in still happened: code + magic-link logins minted and emailed
    // with the sign-in copy (the member already confirmed long ago).
    const loginRows = await db
      .select()
      .from(logins)
      .where(eq(logins.subscriberId, row.id))
    expect(loginRows).toHaveLength(2)
    expect(sendSimpleEmail).toHaveBeenCalledTimes(1)
    const [message] = vi.mocked(sendSimpleEmail).mock.calls[0]
    expect(message.subject).toBe('Your sign-in code for philipithomas.com')
    expect(message.text).toContain('Your sign-in code for philipithomas.com')
  })

  it('signs in an existing confirmed subscriber without re-subscribing them before verification', async () => {
    await db.insert(subscribers).values({
      email: 'reader@example.com',
      name: 'Careful Reader',
      source: 'https://original.example',
      confirmedAt: new Date(),
      subscribedContraption: false,
      subscribedWorkshop: false,
      subscribedPostcard: false,
      subscribedTsundoku: false,
      subscribedUmami: false,
    })

    const res = await POST(
      subscribeRequest({
        email: 'reader@example.com',
        name: 'Overwrite Attempt',
        source: 'https://www.google.com',
        newsletters: ['tsundoku'],
      })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      status: 'verification_sent',
    })

    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, 'reader@example.com'))
    expect(row.subscribedContraption).toBe(false)
    expect(row.subscribedWorkshop).toBe(false)
    expect(row.subscribedPostcard).toBe(false)
    expect(row.subscribedTsundoku).toBe(false)
    expect(row.subscribedUmami).toBe(false)
    expect(row.name).toBe('Careful Reader')
    expect(row.source).toBe('https://original.example')

    const loginRows = await db
      .select()
      .from(logins)
      .where(eq(logins.subscriberId, row.id))
    expect(loginRows).toHaveLength(2)
    const magicLogin = loginRows.find((l) => l.tokenType === 'magic_link')
    expect(sendSimpleEmail).toHaveBeenCalledTimes(1)
    const [message] = vi.mocked(sendSimpleEmail).mock.calls[0]
    expect(message.subject).toBe('Your sign-in code for philipithomas.com')
    expect(message.text).toContain(
      `https://www.philipithomas.com/auth/verify?token=${magicLogin?.token}`
    )
    expect(message.text).not.toContain('newsletter=tsundoku')
  })

  it('does not trust client-provided email-only opt-in on the public route', async () => {
    await db.insert(subscribers).values({
      email: 'guarded@example.com',
      name: 'Guarded Reader',
      source: 'https://original.example',
      confirmedAt: new Date(),
      subscribedContraption: false,
      subscribedWorkshop: false,
      subscribedPostcard: false,
      subscribedTsundoku: false,
      subscribedUmami: false,
    })

    const res = await POST(
      subscribeRequest({
        email: 'guarded@example.com',
        newsletters: ['contraption'],
        allowExistingSubscriberOptIn: true,
      })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      status: 'verification_sent',
    })

    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, 'guarded@example.com'))
    expect(row.subscribedContraption).toBe(false)
    expect(row.subscribedWorkshop).toBe(false)
    expect(row.subscribedPostcard).toBe(false)
    expect(row.subscribedTsundoku).toBe(false)
    expect(row.subscribedUmami).toBe(false)

    expect(sendSimpleEmail).toHaveBeenCalledTimes(1)
    const [message] = vi.mocked(sendSimpleEmail).mock.calls[0]
    expect(message.subject).toBe('Your sign-in code for philipithomas.com')
  })

  it('keeps a confirmed reader opted out until they verify the dedicated Umami signup', async () => {
    await db.insert(subscribers).values({
      email: 'umami-reader@example.com',
      name: 'Umami Reader',
      confirmedAt: new Date(),
      subscribedContraption: false,
      subscribedWorkshop: false,
      subscribedPostcard: false,
      subscribedTsundoku: false,
      subscribedUmami: false,
    })

    const res = await POST_UMAMI(
      subscribeRequest({
        email: 'umami-reader@example.com',
        // The server-owned endpoint constrains the requested newsletter.
        newsletters: ['contraption'],
        allowExistingSubscriberOptIn: true,
      })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      status: 'verification_sent',
    })

    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, 'umami-reader@example.com'))
    expect(row.subscribedContraption).toBe(false)
    expect(row.subscribedUmami).toBe(false)

    expect(sendSimpleEmail).toHaveBeenCalledTimes(1)
    const [message] = vi.mocked(sendSimpleEmail).mock.calls[0]
    expect(message.subject).toBe('Your sign-in code for philipithomas.com')
    expect(message.text).toContain('newsletter=umami')
    expect(message.text).not.toContain('newsletter=contraption')
  })

  it('returns gone from the archived Tsundoku subscribe endpoint', async () => {
    const res = await POST_TSUNDOKU(
      subscribeRequest({
        email: 'japan@example.com',
      })
    )

    expect(res.status).toBe(410)
    expect(await res.json()).toEqual({
      error: 'Tsundoku is archived and no longer accepts subscriptions.',
    })
    expect(await db.select().from(subscribers)).toHaveLength(0)
    expect(sendSimpleEmail).not.toHaveBeenCalled()
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
    expect(await res.json()).toEqual({
      ok: true,
      status: 'verification_sent',
    })
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
