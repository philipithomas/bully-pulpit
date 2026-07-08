import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('botid/server', () =>
  import('@/test/integration/mocks').then((m) => m.botidMock())
)
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return {
    ...actual,
    createRemoteJWKSet: vi.fn(() => ({})),
    jwtVerify: vi.fn(),
  }
})

import { jwtVerify } from 'jose'
import { POST } from '@/app/api/auth/google/route'
import { subscribers } from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'

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
  expect(rows).toHaveLength(1)
  return rows[0]
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
  vi.mocked(jwtVerify).mockReset()
  vi.mocked(jwtVerify).mockResolvedValue({
    payload: {
      email: 'bar@gmail.com',
      email_verified: true,
      name: 'Bar',
    },
    protectedHeader: { alg: 'RS256' },
  } as unknown as Awaited<ReturnType<typeof jwtVerify>>)
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

    const typedEmail = await subscriberByEmail('foo@gmail.com')
    expect(typedEmail.confirmedAt).toBeNull()
    expect(typedEmail.subscribedWorkshop).toBe(false)

    const googleAccount = await subscriberByEmail('bar@gmail.com')
    expect(googleAccount.confirmedAt).not.toBeNull()
    expect(googleAccount.subscribedWorkshop).toBe(true)
    expect(googleAccount.subscribedContraption).toBe(false)
    expect(googleAccount.subscribedPostcard).toBe(false)
    expect(googleAccount.subscribedTsundoku).toBe(false)
  })
})
