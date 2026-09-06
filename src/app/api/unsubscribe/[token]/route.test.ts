import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmailSend, Subscriber } from '@/lib/db/schema'

vi.mock('@/lib/db/queries/email-sends', () => ({
  findByUnsubscribeToken: vi.fn(),
  markUnsubscribed: vi.fn(),
}))

vi.mock('@/lib/db/queries/subscribers', async (importActual) => {
  const actual =
    await importActual<typeof import('@/lib/db/queries/subscribers')>()
  return {
    ...actual,
    findById: vi.fn(),
    updateSubscriber: vi.fn(),
    deleteWithData: vi.fn(),
  }
})

import { DELETE, GET, PATCH, POST } from '@/app/api/unsubscribe/[token]/route'
import * as emailSends from '@/lib/db/queries/email-sends'
import * as subscribers from '@/lib/db/queries/subscribers'

const mockedSends = vi.mocked(emailSends)
const mockedSubs = vi.mocked(subscribers)

function makeSubscriber(overrides: Partial<Subscriber> = {}): Subscriber {
  return {
    id: 1,
    uuid: 'uuid-1',
    email: 'jane@example.com',
    name: 'Jane',
    confirmedAt: new Date(),
    subscribedPostcard: true,
    subscribedContraption: true,
    subscribedWorkshop: true,
    subscribedTsundoku: false,
    subscribedTidbits: true,
    tidbitsOptInNotificationSentAt: null,
    source: null,
    sessionVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeEmailSend(overrides: Partial<EmailSend> = {}): EmailSend {
  return {
    id: 10,
    subscriberId: 1,
    postSlug: 'my-post',
    unsubscribeToken: TOKEN,
    sendError: null,
    triggeredUnsubscribeAt: null,
    createdAt: new Date(),
    subject: 'Subject',
    htmlContent: '<p>x</p>',
    textContent: 'x',
    newsletter: 'contraption',
    sentAt: new Date(),
    attempts: 0,
    nextAttemptAt: null,
    previewText: null,
    ...overrides,
  }
}

// Tokens must be UUID-shaped: the route rejects malformed tokens before the
// (mocked) query layer is ever consulted.
const TOKEN = '5b0e3f6a-9c1d-4e2b-8a7f-0123456789ab'
const GHOST = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

const params = (token: string) => ({ params: Promise.resolve({ token }) })

function patchRequest(
  body: string | Record<string, unknown>,
  contentType = 'application/json'
) {
  return new NextRequest(`http://localhost/api/unsubscribe/${TOKEN}`, {
    method: 'PATCH',
    headers: { 'content-type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/unsubscribe/[token]', () => {
  it('returns masked email and preferences for a valid token', async () => {
    mockedSends.findByUnsubscribeToken.mockResolvedValue(makeEmailSend())
    mockedSubs.findById.mockResolvedValue(
      makeSubscriber({ subscribedWorkshop: false })
    )

    const res = await GET({} as NextRequest, params(TOKEN))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      email: 'j***@example.com',
      newsletter: 'contraption',
      subscribed_postcard: true,
      subscribed_contraption: true,
      subscribed_workshop: false,
      subscribed_tidbits: true,
    })
  })

  it('returns 404 for an unknown token', async () => {
    mockedSends.findByUnsubscribeToken.mockResolvedValue(null)
    const res = await GET({} as NextRequest, params(GHOST))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({
      error: 'Invalid or expired token',
    })
  })
})

describe('PATCH /api/unsubscribe/[token]', () => {
  it('updates preferences from a snake_case body', async () => {
    mockedSends.findByUnsubscribeToken.mockResolvedValue(makeEmailSend())
    mockedSubs.findById.mockResolvedValue(makeSubscriber())
    mockedSubs.updateSubscriber.mockResolvedValue(makeSubscriber())

    const res = await PATCH(
      patchRequest({ subscribed_postcard: false }),
      params(TOKEN)
    )

    expect(mockedSubs.updateSubscriber).toHaveBeenCalledWith('uuid-1', {
      subscribedPostcard: false,
    })
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  it('does not let a historical token enable Tidbits', async () => {
    mockedSends.findByUnsubscribeToken.mockResolvedValue(makeEmailSend())
    mockedSubs.findById.mockResolvedValue(
      makeSubscriber({ subscribedTidbits: false })
    )

    const res = await PATCH(
      patchRequest({ subscribed_tidbits: true }),
      params(TOKEN)
    )

    expect(res.status).toBe(403)
    expect(mockedSubs.updateSubscriber).not.toHaveBeenCalled()
    await expect(res.json()).resolves.toEqual({
      error: 'Sign in to subscribe to Tidbits.',
    })
  })

  it.each([
    {
      label: 'a non-JSON media type',
      request: () => patchRequest('{}', 'text/plain'),
      status: 415,
      error: 'Content-Type must be application/json',
    },
    {
      label: 'malformed JSON',
      request: () => patchRequest('{'),
      status: 400,
      error: 'Invalid request body',
    },
    {
      label: 'an oversized streamed body',
      request: () => patchRequest(JSON.stringify({ name: 'x'.repeat(20_000) })),
      status: 413,
      error: 'Request body is too large',
    },
  ])('rejects $label before resolving the token', async ({
    request,
    status,
    error,
  }) => {
    const res = await PATCH(request(), params(TOKEN))

    expect(res.status).toBe(status)
    await expect(res.json()).resolves.toEqual({ error })
    expect(mockedSends.findByUnsubscribeToken).not.toHaveBeenCalled()
    expect(mockedSubs.findById).not.toHaveBeenCalled()
    expect(mockedSubs.updateSubscriber).not.toHaveBeenCalled()
  })

  it('rejects names beyond the persisted field limit', async () => {
    const res = await PATCH(
      patchRequest({ name: 'x'.repeat(201) }),
      params(TOKEN)
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Invalid preferences in request body',
    })
    expect(mockedSends.findByUnsubscribeToken).not.toHaveBeenCalled()
    expect(mockedSubs.findById).not.toHaveBeenCalled()
    expect(mockedSubs.updateSubscriber).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/unsubscribe/[token]', () => {
  it('unsubscribes from all newsletters without deleting account data', async () => {
    mockedSends.findByUnsubscribeToken.mockResolvedValue(makeEmailSend())
    mockedSubs.findById.mockResolvedValue(makeSubscriber({ id: 7 }))
    mockedSubs.updateSubscriber.mockResolvedValue(makeSubscriber())

    const res = await DELETE({} as NextRequest, params(TOKEN))

    // A leaked unsubscribe token must NOT be able to hard-delete an account.
    expect(mockedSubs.updateSubscriber).toHaveBeenCalledWith('uuid-1', {
      subscribedPostcard: false,
      subscribedContraption: false,
      subscribedWorkshop: false,
      subscribedTidbits: false,
    })
    expect(mockedSends.markUnsubscribed).toHaveBeenCalledWith(10)
    expect(mockedSubs.deleteWithData).not.toHaveBeenCalled()
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  it('returns 404 for an unknown token', async () => {
    mockedSends.findByUnsubscribeToken.mockResolvedValue(null)
    const res = await DELETE({} as NextRequest, params(GHOST))
    expect(res.status).toBe(404)
  })
})

describe('POST /api/unsubscribe/[token] (one-click)', () => {
  it('unsubscribes from the email’s newsletter and marks it', async () => {
    mockedSends.findByUnsubscribeToken.mockResolvedValue(
      makeEmailSend({ newsletter: 'workshop' })
    )
    mockedSubs.findById.mockResolvedValue(makeSubscriber())
    mockedSubs.updateSubscriber.mockResolvedValue(makeSubscriber())

    const res = await POST({} as NextRequest, params(TOKEN))

    expect(mockedSubs.updateSubscriber).toHaveBeenCalledWith('uuid-1', {
      subscribedWorkshop: false,
    })
    expect(mockedSends.markUnsubscribed).toHaveBeenCalledWith(10)
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  it('unsubscribes only from Tidbits for a Tidbits email', async () => {
    mockedSends.findByUnsubscribeToken.mockResolvedValue(
      makeEmailSend({ newsletter: 'tidbits' })
    )
    mockedSubs.findById.mockResolvedValue(makeSubscriber())
    mockedSubs.updateSubscriber.mockResolvedValue(makeSubscriber())

    const res = await POST({} as NextRequest, params(TOKEN))

    expect(mockedSubs.updateSubscriber).toHaveBeenCalledWith('uuid-1', {
      subscribedTidbits: false,
    })
    expect(mockedSends.markUnsubscribed).toHaveBeenCalledWith(10)
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  it('unsubscribes from all newsletters when the email has none set', async () => {
    mockedSends.findByUnsubscribeToken.mockResolvedValue(
      makeEmailSend({ newsletter: null })
    )
    mockedSubs.findById.mockResolvedValue(makeSubscriber())
    mockedSubs.updateSubscriber.mockResolvedValue(makeSubscriber())

    await POST({} as NextRequest, params(TOKEN))

    expect(mockedSubs.updateSubscriber).toHaveBeenCalledWith('uuid-1', {
      subscribedPostcard: false,
      subscribedContraption: false,
      subscribedWorkshop: false,
      subscribedTidbits: false,
    })
  })

  it('preserves the historical field for an old Tsundoku token', async () => {
    mockedSends.findByUnsubscribeToken.mockResolvedValue(
      makeEmailSend({ newsletter: 'tsundoku' })
    )
    mockedSubs.findById.mockResolvedValue(
      makeSubscriber({ subscribedTsundoku: true })
    )
    mockedSubs.updateSubscriber.mockResolvedValue(makeSubscriber())

    await POST({} as NextRequest, params(TOKEN))

    expect(mockedSubs.updateSubscriber).toHaveBeenCalledWith('uuid-1', {})
    expect(mockedSends.markUnsubscribed).toHaveBeenCalledWith(10)
  })
})
