import type { NextRequest } from 'next/server'
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
    source: null,
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
    unsubscribeToken: 'tok',
    sendError: null,
    triggeredUnsubscribeAt: null,
    createdAt: new Date(),
    subject: 'Subject',
    htmlContent: '<p>x</p>',
    newsletter: 'contraption',
    sentAt: new Date(),
    attempts: 0,
    nextAttemptAt: null,
    previewText: null,
    ...overrides,
  }
}

const params = (token: string) => ({ params: Promise.resolve({ token }) })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/unsubscribe/[token]', () => {
  it('returns masked email and preferences for a valid token', async () => {
    mockedSends.findByUnsubscribeToken.mockResolvedValue(makeEmailSend())
    mockedSubs.findById.mockResolvedValue(
      makeSubscriber({ subscribedWorkshop: false })
    )

    const res = await GET({} as NextRequest, params('tok'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      email: 'j***@example.com',
      newsletter: 'contraption',
      subscribed_postcard: true,
      subscribed_contraption: true,
      subscribed_workshop: false,
    })
  })

  it('returns 404 for an unknown token', async () => {
    mockedSends.findByUnsubscribeToken.mockResolvedValue(null)
    const res = await GET({} as NextRequest, params('nope'))
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

    const req = {
      json: async () => ({ subscribed_postcard: false }),
    } as unknown as NextRequest
    const res = await PATCH(req, params('tok'))

    expect(mockedSubs.updateSubscriber).toHaveBeenCalledWith('uuid-1', {
      subscribedPostcard: false,
    })
    await expect(res.json()).resolves.toEqual({ success: true })
  })
})

describe('DELETE /api/unsubscribe/[token]', () => {
  it('deletes the subscriber and all data', async () => {
    mockedSends.findByUnsubscribeToken.mockResolvedValue(makeEmailSend())
    mockedSubs.findById.mockResolvedValue(makeSubscriber({ id: 7 }))

    const res = await DELETE({} as NextRequest, params('tok'))

    expect(mockedSubs.deleteWithData).toHaveBeenCalledWith(7)
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  it('returns 404 for an unknown token', async () => {
    mockedSends.findByUnsubscribeToken.mockResolvedValue(null)
    const res = await DELETE({} as NextRequest, params('nope'))
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

    const res = await POST({} as NextRequest, params('tok'))

    expect(mockedSubs.updateSubscriber).toHaveBeenCalledWith('uuid-1', {
      subscribedWorkshop: false,
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

    await POST({} as NextRequest, params('tok'))

    expect(mockedSubs.updateSubscriber).toHaveBeenCalledWith('uuid-1', {
      subscribedPostcard: false,
      subscribedContraption: false,
      subscribedWorkshop: false,
    })
  })
})
