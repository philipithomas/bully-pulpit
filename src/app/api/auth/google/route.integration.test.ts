import { eq } from 'drizzle-orm'
import { jwtVerify } from 'jose'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('botid/server', () =>
  import('@/test/integration/mocks').then((m) => m.botidMock())
)
vi.mock('@/lib/email/ses', () =>
  import('@/test/integration/mocks').then((m) => m.sesMock())
)
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return {
    ...actual,
    createRemoteJWKSet: vi.fn(() => vi.fn()),
    jwtVerify: vi.fn(),
  }
})

import { POST } from '@/app/api/auth/google/route'
import { subscribers } from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'

const mockedJwtVerify = vi.mocked(jwtVerify)

function googlePost(body: unknown): Request {
  return new Request('http://localhost/api/auth/google', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.9',
    },
    body: JSON.stringify(body),
  })
}

async function subscriberByEmail(email: string) {
  const rows = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, email))
  return rows[0] ?? null
}

async function expectSubscriberByEmail(email: string) {
  const subscriber = await subscriberByEmail(email)
  expect(subscriber).not.toBeNull()
  return subscriber as NonNullable<typeof subscriber>
}

function mockGooglePayload(email: string, name = 'Reader') {
  mockedJwtVerify.mockResolvedValueOnce({
    payload: {
      email,
      email_verified: true,
      name,
    },
    protectedHeader: { alg: 'RS256' },
  } as unknown as Awaited<ReturnType<typeof jwtVerify>>)
}

beforeEach(async () => {
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'google-client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret'

  await resetDb()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        id_token: 'google-id-token',
      })
    )
  )
  mockedJwtVerify.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/auth/google', () => {
  it('applies pending newsletter opt-ins to the Google account, not the typed email', async () => {
    await db.insert(subscribers).values([
      {
        email: 'foo@gmail.com',
        subscribedContraption: false,
        subscribedWorkshop: false,
        subscribedPostcard: false,
        subscribedTsundoku: false,
      },
      {
        email: 'bar@gmail.com',
        confirmedAt: new Date(),
        subscribedContraption: false,
        subscribedWorkshop: false,
        subscribedPostcard: false,
        subscribedTsundoku: false,
      },
    ])
    mockGooglePayload('bar@gmail.com', 'Bar')

    const response = await POST(
      googlePost({
        code: 'oauth-code',
        email: 'foo@gmail.com',
        newsletters: ['workshop'],
      })
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.user.email).toBe('bar@gmail.com')
    expect(body.user.subscribed_workshop).toBe(true)
    expect(response.cookies.get('bp_has_session')?.value).toBe('1')

    const typedEmail = await expectSubscriberByEmail('foo@gmail.com')
    expect(typedEmail.confirmedAt).toBeNull()
    expect(typedEmail.subscribedWorkshop).toBe(false)

    const googleAccount = await expectSubscriberByEmail('bar@gmail.com')
    expect(googleAccount.confirmedAt).not.toBeNull()
    expect(googleAccount.subscribedWorkshop).toBe(true)
    expect(googleAccount.subscribedContraption).toBe(false)
    expect(googleAccount.subscribedPostcard).toBe(false)
    expect(googleAccount.subscribedTsundoku).toBe(false)
  })

  it('rejects an expected email mismatch before creating a subscriber', async () => {
    mockGooglePayload('wrong@example.com', 'Wrong account')

    const response = await POST(
      googlePost({
        code: 'google-code',
        expectedEmail: 'reader@example.com',
        newsletters: ['tsundoku'],
      })
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Use the Google account for reader@example.com.',
    })
    expect(await subscriberByEmail('wrong@example.com')).toBeNull()
    expect(response.headers.getSetCookie()).toHaveLength(0)
  })

  it('applies requested opt-ins for a matching expected Google account', async () => {
    await db.insert(subscribers).values({
      email: 'reader@example.com',
      confirmedAt: new Date(),
      subscribedTsundoku: false,
    })
    mockGooglePayload('reader@example.com')

    const response = await POST(
      googlePost({
        code: 'google-code',
        expectedEmail: 'reader@example.com',
        newsletters: ['tsundoku'],
      })
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.user.email).toBe('reader@example.com')
    expect(body.user.subscribed_tsundoku).toBe(true)
    expect(
      (await subscriberByEmail('reader@example.com'))?.subscribedTsundoku
    ).toBe(true)
    expect(response.headers.getSetCookie().join('\n')).toContain('bp_token=')
  })
})
