import { eq } from 'drizzle-orm'
import { jwtVerify } from 'jose'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

function googlePost(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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

beforeEach(async () => {
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

describe('POST /api/auth/google', () => {
  it('rejects an expected email mismatch before creating a subscriber', async () => {
    mockedJwtVerify.mockResolvedValueOnce({
      payload: {
        email: 'wrong@example.com',
        email_verified: true,
        name: 'Wrong account',
      },
      protectedHeader: {},
    })

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
    mockedJwtVerify.mockResolvedValueOnce({
      payload: {
        email: 'reader@example.com',
        email_verified: true,
        name: 'Reader',
      },
      protectedHeader: {},
    })

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
