import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionSubscribers = vi.hoisted(() => new Map<string, unknown>())

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('next/headers', () => import('@/test/integration/session'))
vi.mock('@/lib/db/queries/subscribers', async (importActual) => {
  const actual =
    await importActual<typeof import('@/lib/db/queries/subscribers')>()
  return {
    ...actual,
    findByUuid: vi.fn((uuid: string) =>
      sessionSubscribers.has(uuid)
        ? sessionSubscribers.get(uuid)
        : actual.findByUuid(uuid)
    ),
  }
})

import {
  DELETE as deleteSmsSubscriber,
  GET as listSmsSubscribers,
} from '@/app/api/printing-press/subscribers/sms/route'
import { signSession } from '@/lib/auth/jwt'
import * as smsSubscriberQueries from '@/lib/db/queries/sms-subscribers'
import {
  bellConversations,
  type NewSmsSubscriber,
  smsSends,
  smsSubscribers,
  textMessages,
} from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'
import { clearSessionStore, setSessionCookie } from '@/test/integration/session'

const BASE = 'http://localhost/api/printing-press/subscribers/sms'

function listRequest(params: Record<string, string> = {}) {
  const url = new URL(BASE)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new NextRequest(url)
}

function deleteRequest(body: unknown) {
  return new NextRequest(BASE, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function signInAs(email: string) {
  const uuid = randomUUID()
  const subscriber = {
    id: -1,
    uuid,
    email,
    name: null,
    confirmedAt: new Date(),
    subscribedPostcard: false,
    subscribedContraption: false,
    subscribedWorkshop: false,
    subscribedTidbits: false,
    subscribedTsundoku: false,
    source: null,
    sessionVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  sessionSubscribers.set(uuid, subscriber)
  setSessionCookie(await signSession(subscriber))
}

const signInAsAdmin = () => signInAs('admin@example.com')

async function seedSmsSubscriber(values: NewSmsSubscriber) {
  const [row] = await db.insert(smsSubscribers).values(values).returning()
  return row
}

function expectPrivate(response: Response) {
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
}

beforeEach(async () => {
  clearSessionStore()
  sessionSubscribers.clear()
  await resetDb()
})

describe('admin guard', () => {
  it('rejects anonymous requests without changing data', async () => {
    const target = await seedSmsSubscriber({
      phoneNumber: '+15551110001',
      confirmedAt: new Date(),
    })
    const responses = await Promise.all([
      listSmsSubscribers(listRequest()),
      deleteSmsSubscriber(deleteRequest({ id: target.id })),
    ])

    for (const response of responses) {
      expect(response.status).toBe(403)
      expectPrivate(response)
    }
    expect(await db.select().from(smsSubscribers)).toHaveLength(1)
  })

  it('rejects a signed-in non-admin', async () => {
    await signInAs('reader@example.com')
    const target = await seedSmsSubscriber({
      phoneNumber: '+15551110001',
      confirmedAt: new Date(),
    })

    expect((await listSmsSubscribers(listRequest())).status).toBe(403)
    expect(
      (await deleteSmsSubscriber(deleteRequest({ id: target.id }))).status
    ).toBe(403)
    expect(await db.select().from(smsSubscribers)).toHaveLength(1)
  })
})

describe('GET list', () => {
  it('returns active and unsubscribed rows newest-first without internal fields', async () => {
    await signInAsAdmin()
    await seedSmsSubscriber({
      phoneNumber: '+15551110001',
      confirmedAt: new Date('2026-07-01T12:00:00.000Z'),
      source: 'sms_keyword',
      createdAt: new Date('2026-07-01T12:00:00.000Z'),
    })
    await seedSmsSubscriber({
      phoneNumber: '+15551110002',
      confirmedAt: null,
      subscribedPostcard: false,
      subscribedContraption: false,
      subscribedWorkshop: false,
      subscribedTidbits: false,
      source: 'twilio_stop',
      createdAt: new Date('2026-07-02T12:00:00.000Z'),
      bellContactCardClaimId: randomUUID(),
    })

    const response = await listSmsSubscribers(listRequest())
    expect(response.status).toBe(200)
    expectPrivate(response)
    const json = await response.json()
    expect(json).toMatchObject({ total: 2, offset: 0, limit: 50 })
    expect(
      json.rows.map((row: { phoneNumber: string }) => row.phoneNumber)
    ).toEqual(['+15551110002', '+15551110001'])
    expect(json.rows[0]).toEqual({
      id: expect.any(Number),
      phoneNumber: '+15551110002',
      confirmedAt: null,
      source: 'twilio_stop',
      createdAt: '2026-07-02T12:00:00.000Z',
    })
    expect(json.rows[1].confirmedAt).toBe('2026-07-01T12:00:00.000Z')
  })

  it('normalizes a formatted phone search and ignores the legacy newsletter parameter', async () => {
    await signInAsAdmin()
    await seedSmsSubscriber({
      phoneNumber: '+15551110001',
      confirmedAt: new Date(),
      subscribedWorkshop: true,
    })
    await seedSmsSubscriber({
      phoneNumber: '+15551110002',
      confirmedAt: new Date(),
      subscribedWorkshop: false,
      subscribedTidbits: false,
    })
    await seedSmsSubscriber({
      phoneNumber: '+442079460123',
      confirmedAt: new Date(),
      subscribedWorkshop: true,
    })

    const response = await listSmsSubscribers(
      listRequest({ q: '+1 (555) 111-000', newsletter: 'workshop' })
    )
    const json = await response.json()
    expect(json.total).toBe(2)
    expect(
      json.rows.map((row: { phoneNumber: string }) => row.phoneNumber).sort()
    ).toEqual(['+15551110001', '+15551110002'])
  })

  it('supports offset pagination', async () => {
    await signInAsAdmin()
    for (let i = 0; i < 51; i += 1) {
      await seedSmsSubscriber({
        phoneNumber: `+1555${String(10_000_000 + i)}`,
        confirmedAt: new Date(),
      })
    }

    const response = await listSmsSubscribers(listRequest({ offset: '50' }))
    const json = await response.json()
    expect(json.total).toBe(51)
    expect(json.rows).toHaveLength(1)
  })

  it('rejects invalid filters before querying', async () => {
    await signInAsAdmin()
    const responses = await Promise.all([
      listSmsSubscribers(listRequest({ q: 'not a number' })),
      listSmsSubscribers(listRequest({ offset: '-1' })),
    ])
    expect(responses.map((response) => response.status)).toEqual([400, 400])
    for (const response of responses) expectPrivate(response)
  })
})

describe('DELETE', () => {
  it('rejects malformed, missing, and invalid ids', async () => {
    await signInAsAdmin()
    const responses = await Promise.all([
      deleteSmsSubscriber(
        new NextRequest(BASE, { method: 'DELETE', body: 'not json' })
      ),
      deleteSmsSubscriber(deleteRequest({})),
      deleteSmsSubscriber(deleteRequest({ id: 1.5 })),
      deleteSmsSubscriber(deleteRequest({ id: '1' })),
    ])
    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400, 400,
    ])
  })

  it('returns 404 for an unknown id', async () => {
    await signInAsAdmin()
    const response = await deleteSmsSubscriber(deleteRequest({ id: 999 }))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
    expectPrivate(response)
  })

  it('deletes an active subscription and its sends but keeps Phone and Bell history', async () => {
    await signInAsAdmin()
    const target = await seedSmsSubscriber({
      phoneNumber: '+15551110001',
      confirmedAt: new Date(),
    })
    const other = await seedSmsSubscriber({
      phoneNumber: '+15551110002',
      confirmedAt: new Date(),
    })
    await db.insert(smsSends).values([
      {
        smsSubscriberId: target.id,
        postSlug: 'target-pending',
        body: 'Pending target send',
      },
      {
        smsSubscriberId: target.id,
        postSlug: 'target-sent',
        body: 'Sent target send',
        twilioSid: 'SM_TARGET_SENT',
        twilioStatus: 'delivered',
        sentAt: new Date(),
      },
      {
        smsSubscriberId: target.id,
        postSlug: 'target-failed',
        body: 'Failed target send',
        sendError: 'provider_error',
      },
      {
        smsSubscriberId: target.id,
        postSlug: 'target-skipped',
        body: 'Skipped target send',
        sendError: 'skipped_unsubscribed',
      },
      {
        smsSubscriberId: other.id,
        postSlug: 'other-post',
        body: 'Other send',
      },
    ])
    const [conversation] = await db
      .insert(bellConversations)
      .values({
        surface: 'sms',
        smsSubscriberId: target.id,
        smsPhoneHash: 'target-phone-hash',
      })
      .returning()
    await db.insert(textMessages).values({
      fromNumber: target.phoneNumber,
      toNumber: '+12123473190',
      body: 'Please help',
      direction: 'inbound',
    })

    const response = await deleteSmsSubscriber(deleteRequest({ id: target.id }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expectPrivate(response)

    const remainingSubscribers = await db.select().from(smsSubscribers)
    expect(remainingSubscribers.map((row) => row.id)).toEqual([other.id])
    const remainingSends = await db.select().from(smsSends)
    expect(remainingSends.map((row) => row.smsSubscriberId)).toEqual([other.id])
    const [remainingConversation] = await db
      .select()
      .from(bellConversations)
      .where(eq(bellConversations.id, conversation.id))
    expect(remainingConversation.smsSubscriberId).toBeNull()
    expect(await db.select().from(textMessages)).toHaveLength(1)
  })

  it('preserves an unsubscribed STOP tombstone and its sends', async () => {
    await signInAsAdmin()
    const target = await seedSmsSubscriber({
      phoneNumber: '+15551110001',
      confirmedAt: null,
      subscribedPostcard: false,
      subscribedContraption: false,
      subscribedWorkshop: false,
      subscribedTidbits: false,
    })
    await db.insert(smsSends).values({
      smsSubscriberId: target.id,
      postSlug: 'old-post',
      body: 'Old send',
      sendError: 'skipped_unsubscribed',
    })

    const response = await deleteSmsSubscriber(deleteRequest({ id: target.id }))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error:
        'Unsubscribed numbers keep their STOP record and cannot be deleted here.',
    })
    expect(await db.select().from(smsSubscribers)).toHaveLength(1)
    expect(await db.select().from(smsSends)).toHaveLength(1)
  })

  it('returns 409 when an active subscriber becomes a STOP record before deletion', async () => {
    await signInAsAdmin()
    const target = await seedSmsSubscriber({
      phoneNumber: '+15551110001',
      confirmedAt: new Date(),
    })
    const deleteSpy = vi
      .spyOn(smsSubscriberQueries, 'deleteSmsSubscriberWithData')
      .mockImplementationOnce(async (id) => {
        await db
          .update(smsSubscribers)
          .set({
            confirmedAt: null,
            subscribedPostcard: false,
            subscribedContraption: false,
            subscribedWorkshop: false,
            subscribedTidbits: false,
          })
          .where(eq(smsSubscribers.id, id))
        return false
      })

    const response = await deleteSmsSubscriber(deleteRequest({ id: target.id }))
    deleteSpy.mockRestore()

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'This subscriber changed and was not deleted.',
    })
    const [remaining] = await db.select().from(smsSubscribers)
    expect(remaining.confirmedAt).toBeNull()
  })
})
