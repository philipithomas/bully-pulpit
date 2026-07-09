import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import {
  bellConversationExpiry,
  createSmsBellTurn,
  createWebBellTurn,
  deleteBellConversation,
  getBellConversationDetail,
  getOrCreateSmsBellConversation,
  getOrCreateWebBellConversation,
  listBellConversations,
  purgeExpiredBellConversations,
  redactBellConversation,
} from '@/lib/db/queries/bell-conversations'
import {
  completeBellGeneration,
  failBellGeneration,
  markBellGenerationRunning,
} from '@/lib/db/queries/bell-generations'
import {
  bellConversations,
  bellGenerations,
  bellMessages,
  subscribers,
  textMessages,
} from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'

const NOW = new Date('2026-07-09T12:00:00.000Z')
const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

beforeEach(async () => {
  await resetDb()
})

describe('Bell conversation persistence', () => {
  it('maps a client UUID to a separate server UUID and upgrades trusted identity', async () => {
    const anonymous = await getOrCreateWebBellConversation({
      clientConversationId: CLIENT_ID,
      networkIdentityHash: 'abcdef123456',
      networkIdentityPeriod: '2026-07',
      pagePath: '/workshop',
      now: NOW,
    })
    expect(anonymous.id).not.toBe(CLIENT_ID)
    expect(anonymous.expiresAt).toEqual(
      bellConversationExpiry('web', false, NOW)
    )

    const [subscriber] = await db
      .insert(subscribers)
      .values({ email: 'reader@example.com', name: 'Reader' })
      .returning()
    const attributed = await getOrCreateWebBellConversation({
      clientConversationId: CLIENT_ID,
      subscriberId: subscriber.id,
      networkIdentityHash: 'should-not-survive',
      networkIdentityPeriod: '2026-08',
      pagePath: '/contraption',
      now: NOW,
    })
    expect(attributed.id).toBe(anonymous.id)
    expect(attributed.subscriberId).toBe(subscriber.id)
    expect(attributed.networkIdentityHash).toBeNull()
    expect(attributed.expiresAt).toEqual(
      bellConversationExpiry('web', true, NOW)
    )

    const attemptedMove = await getOrCreateWebBellConversation({
      clientConversationId: CLIENT_ID,
      subscriberId: subscriber.id + 999,
      now: NOW,
    })
    expect(attemptedMove.subscriberId).toBe(subscriber.id)
  })

  it('keeps subscriber attribution sticky during concurrent upserts', async () => {
    const [subscriber] = await db
      .insert(subscribers)
      .values({ email: 'concurrent@example.com', name: 'Concurrent reader' })
      .returning()

    await Promise.all([
      getOrCreateWebBellConversation({
        clientConversationId: CLIENT_ID,
        subscriberId: subscriber.id,
        now: NOW,
      }),
      getOrCreateWebBellConversation({
        clientConversationId: CLIENT_ID,
        networkIdentityHash: 'anonymous-request',
        networkIdentityPeriod: '2026-07',
        now: NOW,
      }),
    ])

    const [conversation] = await db
      .select()
      .from(bellConversations)
      .where(eq(bellConversations.clientConversationId, CLIENT_ID))
    expect(conversation.subscriberId).toBe(subscriber.id)
    expect(conversation.networkIdentityHash).toBeNull()
    expect(conversation.expiresAt).toEqual(
      bellConversationExpiry('web', true, NOW)
    )
  })

  it('deduplicates browser and SMS source messages', async () => {
    const web = await getOrCreateWebBellConversation({
      clientConversationId: CLIENT_ID,
      now: NOW,
    })
    const first = await createWebBellTurn({
      conversation: web,
      requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      clientMessageId: 'client-message-1',
      content: 'Hello',
      parts: [{ type: 'text', text: 'Hello' }],
    })
    const duplicate = await createWebBellTurn({
      conversation: web,
      requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      clientMessageId: 'client-message-1',
      content: 'Tampered replay',
      parts: [{ type: 'text', text: 'Tampered replay' }],
    })
    expect(duplicate.userMessage.id).toBe(first.userMessage.id)
    expect(duplicate.generation.id).toBe(first.generation.id)
    expect(duplicate.userMessage.content).toBe('Hello')
    expect(await db.select().from(bellMessages)).toHaveLength(1)

    const [transport] = await db
      .insert(textMessages)
      .values({
        fromNumber: '+15551234567',
        toNumber: '+12123473190',
        body: 'Text Bell',
        direction: 'inbound',
        twilioSid: 'SM_ONE',
      })
      .returning()
    const sms = await getOrCreateSmsBellConversation({
      smsPhoneHash: 'stable-keyed-phone-hash',
      now: NOW,
    })
    const smsFirst = await createSmsBellTurn({
      conversation: sms,
      inboundTextMessageId: transport.id,
    })
    const smsDuplicate = await createSmsBellTurn({
      conversation: sms,
      inboundTextMessageId: transport.id,
    })
    expect(smsDuplicate.userMessage.id).toBe(smsFirst.userMessage.id)
    expect(smsDuplicate.generation.id).toBe(smsFirst.generation.id)
  })

  it('lists participant attribution without searching transcript bodies', async () => {
    const [subscriber] = await db
      .insert(subscribers)
      .values({ email: 'reader@example.com', name: 'Ada Reader' })
      .returning()
    const signed = await getOrCreateWebBellConversation({
      clientConversationId: CLIENT_ID,
      subscriberId: subscriber.id,
      pagePath: '/postcard',
      now: NOW,
    })
    await createWebBellTurn({
      conversation: signed,
      requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      clientMessageId: 'message-a',
      content: 'a transcript-only secret phrase',
      parts: [{ type: 'text', text: 'a transcript-only secret phrase' }],
    })
    const anonymous = await getOrCreateWebBellConversation({
      clientConversationId: '22222222-2222-4222-8222-222222222222',
      networkIdentityHash: 'a1b2c3d4deadbeef',
      networkIdentityPeriod: '2026-07',
      now: new Date(NOW.getTime() + 1_000),
    })

    const byName = await listBellConversations({ search: 'Ada' })
    expect(byName.conversations.map((row) => row.id)).toEqual([signed.id])
    const byNetworkPrefix = await listBellConversations({ search: 'a1b2c3d4' })
    expect(byNetworkPrefix.conversations[0]).toMatchObject({
      id: anonymous.id,
      networkIdentityLabel: 'Network a1b2c3d4 (2026-07)',
    })
    expect(
      await listBellConversations({ search: 'transcript-only secret' })
    ).toMatchObject({ conversations: [] })

    const pageOne = await listBellConversations({ limit: 1 })
    expect(pageOne.conversations).toHaveLength(1)
    expect(pageOne.nextCursor).toEqual(expect.any(String))
    const pageTwo = await listBellConversations({
      limit: 1,
      cursor: pageOne.nextCursor ?? undefined,
    })
    expect(pageTwo.conversations).toHaveLength(1)
    expect(pageTwo.conversations[0].id).not.toBe(pageOne.conversations[0].id)
  })

  it('links an SMS thread without copying the transport transcript', async () => {
    const [transport] = await db
      .insert(textMessages)
      .values({
        fromNumber: '+15551234567',
        toNumber: '+12123473190',
        body: 'Where is that post?',
        direction: 'inbound',
        twilioSid: 'SM_LINKED',
      })
      .returning()
    const sms = await getOrCreateSmsBellConversation({
      smsPhoneHash: 'phone-hash',
      now: NOW,
    })
    await createSmsBellTurn({
      conversation: sms,
      inboundTextMessageId: transport.id,
    })

    const listed = await listBellConversations({ surface: 'sms' })
    expect(listed.conversations[0]).toMatchObject({
      identity: 'phone',
      smsNumber: '+15551234567',
    })
    expect(await db.select().from(textMessages)).toHaveLength(1)
  })

  it('keeps a web conversation aligned with its newest concurrent generation', async () => {
    const conversation = await getOrCreateWebBellConversation({
      clientConversationId: CLIENT_ID,
      now: NOW,
    })
    const older = await createWebBellTurn({
      conversation,
      requestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      clientMessageId: 'older-message',
      content: 'First question',
      parts: [{ type: 'text', text: 'First question' }],
    })
    const newer = await createWebBellTurn({
      conversation,
      requestId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      clientMessageId: 'newer-message',
      content: 'Second question',
      parts: [{ type: 'text', text: 'Second question' }],
    })
    await db
      .update(bellGenerations)
      .set({ createdAt: new Date('2026-07-09T12:00:01.000Z') })
      .where(eq(bellGenerations.id, older.generation.id))
    await db
      .update(bellGenerations)
      .set({ createdAt: new Date('2026-07-09T12:00:02.000Z') })
      .where(eq(bellGenerations.id, newer.generation.id))

    await markBellGenerationRunning(older.generation.id)
    await markBellGenerationRunning(newer.generation.id)
    await failBellGeneration(newer.generation.id, new Error('Newest failed'))
    // The older request finishes last, but it must not overwrite the status
    // derived from the newer request.
    await completeBellGeneration(older.generation.id, {})

    const detail = await getBellConversationDetail(conversation.id)
    expect(detail?.conversation).toMatchObject({
      status: 'error',
      latestGenerationStatus: 'error',
    })
  })

  it('keeps an SMS conversation aligned with its newest concurrent generation', async () => {
    const transports = await db
      .insert(textMessages)
      .values([
        {
          fromNumber: '+15551234567',
          toNumber: '+12123473190',
          body: 'First text',
          direction: 'inbound',
          twilioSid: 'SM_CONCURRENT_OLD',
        },
        {
          fromNumber: '+15551234567',
          toNumber: '+12123473190',
          body: 'Second text',
          direction: 'inbound',
          twilioSid: 'SM_CONCURRENT_NEW',
        },
      ])
      .returning()
    const conversation = await getOrCreateSmsBellConversation({
      smsPhoneHash: 'concurrent-phone-hash',
      now: NOW,
    })
    const older = await createSmsBellTurn({
      conversation,
      inboundTextMessageId: transports[0].id,
    })
    const newer = await createSmsBellTurn({
      conversation,
      inboundTextMessageId: transports[1].id,
    })
    await db
      .update(bellGenerations)
      .set({ createdAt: new Date('2026-07-09T12:00:01.000Z') })
      .where(eq(bellGenerations.id, older.generation.id))
    await db
      .update(bellGenerations)
      .set({ createdAt: new Date('2026-07-09T12:00:02.000Z') })
      .where(eq(bellGenerations.id, newer.generation.id))

    await markBellGenerationRunning(older.generation.id)
    await markBellGenerationRunning(newer.generation.id)
    await completeBellGeneration(newer.generation.id, {})
    // A late failure from the older workflow cannot flip a successful newer
    // SMS reply to an error state.
    await failBellGeneration(older.generation.id, new Error('Older failed'))

    const detail = await getBellConversationDetail(conversation.id)
    expect(detail?.conversation).toMatchObject({
      status: 'completed',
      latestGenerationStatus: 'completed',
    })
  })

  it('redacts content, retains aggregates, and hard-deletes only Bell rows', async () => {
    const conversation = await getOrCreateWebBellConversation({
      clientConversationId: CLIENT_ID,
      now: NOW,
    })
    const turn = await createWebBellTurn({
      conversation,
      requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      clientMessageId: 'message-a',
      content: 'private question',
      parts: [{ type: 'text', text: 'private question' }],
    })
    await markBellGenerationRunning(turn.generation.id)
    await completeBellGeneration(turn.generation.id, {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      costUsd: 0.0001,
      toolsUsed: ['searchPosts'],
    })
    await failBellGeneration(
      turn.generation.id,
      new Error('provider echoed private question')
    )

    expect(await redactBellConversation(conversation.id)).toBe(true)
    const detail = await getBellConversationDetail(conversation.id)
    expect(detail?.messages[0]).toMatchObject({
      content: '[Redacted]',
      parts: null,
      status: 'redacted',
    })
    expect(detail?.generations[0]).toMatchObject({
      totalTokens: 15,
      costUsd: 0.0001,
      toolsUsed: ['searchPosts'],
      errorCode: 'Error',
      errorMessage: null,
    })

    expect(await deleteBellConversation(conversation.id)).toBe(true)
    expect(await getBellConversationDetail(conversation.id)).toBeNull()
  })

  it('purges expired web conversations but keeps SMS metadata', async () => {
    await getOrCreateWebBellConversation({
      clientConversationId: CLIENT_ID,
      now: new Date('2025-01-01T00:00:00.000Z'),
    })
    const current = await getOrCreateWebBellConversation({
      clientConversationId: '22222222-2222-4222-8222-222222222222',
      now: NOW,
    })
    const sms = await getOrCreateSmsBellConversation({
      smsPhoneHash: 'keep-sms',
      now: new Date('2020-01-01T00:00:00.000Z'),
    })

    expect(await purgeExpiredBellConversations(NOW)).toBe(1)
    const remaining = await db.select().from(bellConversations)
    expect(remaining.map((row) => row.id).sort()).toEqual(
      [current.id, sms.id].sort()
    )
  })
})
