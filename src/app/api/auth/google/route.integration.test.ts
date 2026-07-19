import { checkBotId } from 'botid/server'
import { eq } from 'drizzle-orm'
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
    createRemoteJWKSet: vi.fn(() => ({})),
    jwtVerify: vi.fn(),
  }
})

import { decodeJwt, jwtVerify } from 'jose'
import { POST } from '@/app/api/auth/google/route'
import { GOOGLE_OAUTH_STATE_COOKIE } from '@/lib/auth/google-oauth-state'
import { NEW_SUBSCRIBER_ONBOARDING_COOKIE } from '@/lib/auth/jwt'
import { siteConfig } from '@/lib/config'
import { subscribers } from '@/lib/db/schema'
import { sendSimpleEmail } from '@/lib/email/ses'
import { db, resetDb } from '@/test/integration/db'

function googlePost(body: unknown): Request {
  const state = 'server-issued-state'
  return new Request('http://localhost/api/auth/google', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.9',
      cookie: `${GOOGLE_OAUTH_STATE_COOKIE}=${state}`,
    },
    body: JSON.stringify({
      ...(body as Record<string, unknown>),
      state,
    }),
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
  vi.clearAllMocks()
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
  it('rejects missing or mismatched state before contacting Google', async () => {
    const response = await POST(
      new Request('http://localhost/api/auth/google', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${GOOGLE_OAUTH_STATE_COOKIE}=server-issued-state`,
        },
        body: JSON.stringify({ code: 'oauth-code', state: 'attacker-state' }),
      })
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Invalid OAuth state' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects oversized JSON before BotID or the Google token exchange', async () => {
    const response = await POST(googlePost({ code: 'x'.repeat(20_000) }))

    expect(response.status).toBe(413)

    const missingCode = await POST(googlePost({}))
    expect(missingCode.status).toBe(400)
    expect(await missingCode.json()).toEqual({
      error: 'Authorization code is required',
    })
    expect(checkBotId).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('applies pending newsletter opt-ins to the Google account, not the typed email', async () => {
    await db.insert(subscribers).values([
      {
        email: 'foo@gmail.com',
        subscribedContraption: false,
        subscribedWorkshop: false,
        subscribedPostcard: false,
        subscribedTsundoku: false,
        subscribedTidbits: false,
      },
      {
        email: 'bar@gmail.com',
        confirmedAt: new Date(),
        subscribedContraption: false,
        subscribedWorkshop: false,
        subscribedPostcard: false,
        subscribedTsundoku: false,
        subscribedTidbits: false,
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
    expect(response.cookies.get('__Host-bp_has_session')?.value).toBe('1')
    expect(response.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value).toBe('')
    expect(response.cookies.get(NEW_SUBSCRIBER_ONBOARDING_COOKIE)).toBe(
      undefined
    )

    const typedEmail = await subscriberByEmail('foo@gmail.com')
    expect(typedEmail.confirmedAt).toBeNull()
    expect(typedEmail.subscribedWorkshop).toBe(false)

    const googleAccount = await subscriberByEmail('bar@gmail.com')
    expect(googleAccount.confirmedAt).not.toBeNull()
    expect(googleAccount.subscribedWorkshop).toBe(true)
    expect(googleAccount.subscribedContraption).toBe(false)
    expect(googleAccount.subscribedPostcard).toBe(false)
    expect(googleAccount.subscribedTsundoku).toBe(false)
    expect(googleAccount.subscribedTidbits).toBe(false)
  })

  it('securely opts an existing Google account into Tidbits and notifies admin', async () => {
    await db.insert(subscribers).values({
      email: 'bar@gmail.com',
      name: 'Bar',
      confirmedAt: new Date(),
      subscribedContraption: false,
      subscribedWorkshop: false,
      subscribedPostcard: false,
      subscribedTsundoku: false,
      subscribedTidbits: false,
    })

    const response = await POST(
      googlePost({ code: 'oauth-code', newsletters: ['tidbits'] })
    )

    expect(response.status).toBe(200)
    expect((await response.json()).user.subscribed_tidbits).toBe(true)
    expect((await subscriberByEmail('bar@gmail.com')).subscribedTidbits).toBe(
      true
    )
    const optInNotifications = vi
      .mocked(sendSimpleEmail)
      .mock.calls.filter(([message]) =>
        message.subject.startsWith('Existing subscriber opted into tidbits:')
      )
    expect(optInNotifications).toHaveLength(1)
    expect(optInNotifications[0][0]).toMatchObject({
      to: siteConfig.adminEmails,
      subject: 'Existing subscriber opted into tidbits: bar@gmail.com',
    })
  })

  it('sets onboarding when Google creates and confirms a new subscriber', async () => {
    const response = await POST(
      googlePost({
        code: 'oauth-code',
        email: 'bar@gmail.com',
      })
    )

    expect(response.status).toBe(200)
    const subscriber = await subscriberByEmail('bar@gmail.com')
    expect(subscriber).toMatchObject({
      subscribedContraption: true,
      subscribedWorkshop: true,
      subscribedPostcard: true,
      subscribedTsundoku: false,
      subscribedTidbits: true,
    })
    expect(
      vi
        .mocked(sendSimpleEmail)
        .mock.calls.filter(([message]) =>
          message.subject.startsWith('Existing subscriber opted into tidbits:')
        )
    ).toHaveLength(0)
    const marker = response.cookies.get(NEW_SUBSCRIBER_ONBOARDING_COOKIE)?.value
    expect(marker).toBeTruthy()
    expect(decodeJwt(marker as string)).toMatchObject({
      sub: subscriber.uuid,
      purpose: 'new-subscriber-onboarding',
    })
  })
})
