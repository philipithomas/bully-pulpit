import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import {
  conversationWith,
  createTextMessage,
  listConversations,
} from '@/lib/db/queries/text-messages'
import { textMessages } from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'

beforeEach(resetDb)

const NYC = '+12123473190'
const ALICE = '+15551110001'
const BOB = '+15551110002'

function inbound(from: string, sid: string, body = 'hi', createdAt?: Date) {
  return {
    fromNumber: from,
    toNumber: NYC,
    body,
    direction: 'inbound',
    twilioSid: sid,
    status: 'received',
    ...(createdAt ? { createdAt } : {}),
  }
}

function outbound(
  to: string,
  sid: string | null,
  body = 'yo',
  createdAt?: Date
) {
  return {
    fromNumber: NYC,
    toNumber: to,
    body,
    direction: 'outbound',
    twilioSid: sid,
    status: 'queued',
    ...(createdAt ? { createdAt } : {}),
  }
}

describe('createTextMessage', () => {
  it('inserts and returns the row', async () => {
    const row = await createTextMessage(inbound(ALICE, 'SM1', 'hello'))
    expect(row).toMatchObject({
      fromNumber: ALICE,
      toNumber: NYC,
      body: 'hello',
      direction: 'inbound',
      twilioSid: 'SM1',
    })
  })

  it('deduplicates by twilio sid and returns the original row', async () => {
    const first = await createTextMessage(inbound(ALICE, 'SM1', 'hello'))
    const second = await createTextMessage(inbound(ALICE, 'SM1', 'hello'))
    expect(second.id).toBe(first.id)
    expect(await db.select().from(textMessages)).toHaveLength(1)
  })

  it('allows multiple rows without a sid (failed outbound attempts)', async () => {
    await createTextMessage(outbound(ALICE, null))
    await createTextMessage(outbound(ALICE, null))
    expect(await db.select().from(textMessages)).toHaveLength(2)
  })

  it('rejects an invalid direction', async () => {
    await expect(
      createTextMessage({
        fromNumber: ALICE,
        toNumber: NYC,
        body: 'x',
        direction: 'sideways',
      })
    ).rejects.toThrow()
  })
})

describe('listConversations', () => {
  it('groups by external number with the latest message, most recent first', async () => {
    const t = (minutes: number) => new Date(2026, 0, 1, 12, minutes)
    await createTextMessage(inbound(ALICE, 'SM1', 'alice first', t(0)))
    await createTextMessage(outbound(ALICE, 'SM2', 'reply to alice', t(5)))
    await createTextMessage(inbound(BOB, 'SM3', 'bob says hi', t(10)))

    const conversations = await listConversations()
    expect(conversations.map((c) => c.number)).toEqual([BOB, ALICE])
    expect(conversations[0].lastMessage.body).toBe('bob says hi')
    expect(conversations[1].lastMessage.body).toBe('reply to alice')
    expect(conversations[1].lastMessage.direction).toBe('outbound')
  })

  it('returns an empty list with no messages', async () => {
    expect(await listConversations()).toEqual([])
  })
})

describe('conversationWith', () => {
  it('returns both directions with one number, oldest first', async () => {
    const t = (minutes: number) => new Date(2026, 0, 1, 12, minutes)
    await createTextMessage(inbound(ALICE, 'SM1', 'one', t(0)))
    await createTextMessage(outbound(ALICE, 'SM2', 'two', t(1)))
    await createTextMessage(inbound(BOB, 'SM3', 'unrelated', t(2)))
    await createTextMessage(inbound(ALICE, 'SM4', 'three', t(3)))

    const thread = await conversationWith(ALICE)
    expect(thread.map((m) => m.body)).toEqual(['one', 'two', 'three'])
  })
})
