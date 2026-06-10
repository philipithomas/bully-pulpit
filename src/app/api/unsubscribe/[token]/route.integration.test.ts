import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import { DELETE, GET, PATCH, POST } from '@/app/api/unsubscribe/[token]/route'
import { bulkCreateQueued } from '@/lib/db/queries/email-sends'
import { createSubscriber } from '@/lib/db/queries/subscribers'
import { emailSends, subscribers } from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'

beforeEach(resetDb)

const params = (token: string) => ({ params: Promise.resolve({ token }) })

const request = (
  token: string,
  init?: ConstructorParameters<typeof NextRequest>[1]
) => new NextRequest(`http://localhost/api/unsubscribe/${token}`, init)

/**
 * Seeds a subscriber and one queued email_sends row through the real query
 * layer; bulkCreateQueued lets Postgres mint the unsubscribe_token.
 */
async function seed(newsletter = 'contraption') {
  const subscriber = await createSubscriber({
    email: 'jane@example.com',
    name: 'Jane',
  })
  const [sendId] = await bulkCreateQueued({
    subscriberIds: [subscriber.id],
    postSlug: 'my-post',
    newsletter,
    subject: 'My Post',
    htmlContent: '<p>hello</p>',
    textContent: 'hello',
  })
  const send = await sendRow(sendId)
  return { subscriber, send, token: send.unsubscribeToken }
}

async function subscriberRow(id: number) {
  const [row] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.id, id))
  return row
}

async function sendRow(id: number) {
  const [row] = await db.select().from(emailSends).where(eq(emailSends.id, id))
  return row
}

describe('GET /api/unsubscribe/[token]', () => {
  it('returns the masked email and current preferences', async () => {
    const { token } = await seed('contraption')
    expect(token).toMatch(/^[0-9a-f-]{36}$/)

    const res = await GET(request(token), params(token))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      email: 'j***@example.com',
      newsletter: 'contraption',
      subscribed_postcard: true,
      subscribed_contraption: true,
      subscribed_workshop: true,
    })
  })
})

describe('POST /api/unsubscribe/[token] (RFC 8058 one-click)', () => {
  it("flips only that send's newsletter flag and stamps the send row", async () => {
    const { subscriber, send, token } = await seed('workshop')

    const res = await POST(request(token, { method: 'POST' }), params(token))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })

    const after = await subscriberRow(subscriber.id)
    expect(after.subscribedWorkshop).toBe(false)
    expect(after.subscribedPostcard).toBe(true)
    expect(after.subscribedContraption).toBe(true)

    const stamped = await sendRow(send.id)
    expect(stamped.triggeredUnsubscribeAt).toBeInstanceOf(Date)
  })
})

describe('DELETE /api/unsubscribe/[token]', () => {
  it('clears all three flags but retains the subscriber row', async () => {
    const { subscriber, send, token } = await seed()

    const res = await DELETE(
      request(token, { method: 'DELETE' }),
      params(token)
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })

    const after = await subscriberRow(subscriber.id)
    expect(after).toBeDefined()
    expect(after.email).toBe('jane@example.com')
    expect(after.subscribedPostcard).toBe(false)
    expect(after.subscribedContraption).toBe(false)
    expect(after.subscribedWorkshop).toBe(false)

    const stamped = await sendRow(send.id)
    expect(stamped.triggeredUnsubscribeAt).toBeInstanceOf(Date)
  })
})

describe('PATCH /api/unsubscribe/[token]', () => {
  it('persists preference changes from a snake_case body', async () => {
    const { subscriber, token } = await seed()

    const res = await PATCH(
      request(token, {
        method: 'PATCH',
        body: JSON.stringify({ subscribed_postcard: false, name: 'Janet' }),
        headers: { 'content-type': 'application/json' },
      }),
      params(token)
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })

    const after = await subscriberRow(subscriber.id)
    expect(after.subscribedPostcard).toBe(false)
    expect(after.subscribedContraption).toBe(true)
    expect(after.subscribedWorkshop).toBe(true)
    expect(after.name).toBe('Janet')
  })

  it('returns 400 (not 500) for a malformed JSON body and changes nothing', async () => {
    const { subscriber, token } = await seed()

    const res = await PATCH(
      request(token, {
        method: 'PATCH',
        body: 'not json',
        headers: { 'content-type': 'application/json' },
      }),
      params(token)
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Invalid request body',
    })

    const after = await subscriberRow(subscriber.id)
    expect(after.subscribedPostcard).toBe(true)
    expect(after.subscribedContraption).toBe(true)
    expect(after.subscribedWorkshop).toBe(true)
  })
})

describe('unknown token', () => {
  it('returns 404 from every handler and changes nothing', async () => {
    const { subscriber } = await seed()
    const ghost = crypto.randomUUID()

    const getRes = await GET(request(ghost), params(ghost))
    expect(getRes.status).toBe(404)
    await expect(getRes.json()).resolves.toEqual({
      error: 'Invalid or expired token',
    })

    const postRes = await POST(
      request(ghost, { method: 'POST' }),
      params(ghost)
    )
    expect(postRes.status).toBe(404)
    // Each 404 is a fresh response with a readable body, not a shared instance.
    await expect(postRes.json()).resolves.toEqual({
      error: 'Invalid or expired token',
    })

    const deleteRes = await DELETE(
      request(ghost, { method: 'DELETE' }),
      params(ghost)
    )
    expect(deleteRes.status).toBe(404)

    const patchRes = await PATCH(
      request(ghost, {
        method: 'PATCH',
        body: JSON.stringify({ subscribed_postcard: false }),
        headers: { 'content-type': 'application/json' },
      }),
      params(ghost)
    )
    expect(patchRes.status).toBe(404)

    const after = await subscriberRow(subscriber.id)
    expect(after.subscribedPostcard).toBe(true)
    expect(after.subscribedContraption).toBe(true)
    expect(after.subscribedWorkshop).toBe(true)
  })

  it('returns 404 (not 500) for a malformed non-UUID token', async () => {
    // unsubscribe_token is a uuid column; without the route's format guard
    // this would throw a Postgres 22P02 cast error.
    const res = await GET(request('not-a-uuid'), params('not-a-uuid'))
    expect(res.status).toBe(404)
  })
})
