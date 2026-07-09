import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/admin', () => ({ guardAdmin: vi.fn() }))
vi.mock('@/lib/db/queries/bell-conversations', () => ({
  listBellConversations: vi.fn(),
  getBellConversationDetail: vi.fn(),
  redactBellConversation: vi.fn(),
  deleteBellConversation: vi.fn(),
}))

import { POST as redactConversation } from '@/app/api/printing-press/bell/[id]/redact/route'
import {
  DELETE as deleteConversation,
  GET as getConversation,
} from '@/app/api/printing-press/bell/[id]/route'
import { GET as listConversations } from '@/app/api/printing-press/bell/route'
import { guardAdmin } from '@/lib/auth/admin'
import {
  deleteBellConversation,
  getBellConversationDetail,
  listBellConversations,
  redactBellConversation,
} from '@/lib/db/queries/bell-conversations'

const BASE = 'http://localhost/api/printing-press/bell'
const CONVERSATION_ID = '123e4567-e89b-42d3-a456-426614174000'
const MESSAGE_ID = '123e4567-e89b-42d3-a456-426614174001'
const GENERATION_ID = '123e4567-e89b-42d3-a456-426614174002'
const context = (id = CONVERSATION_ID) => ({
  params: Promise.resolve({ id }),
})

const summary = {
  id: CONVERSATION_ID,
  surface: 'web' as const,
  status: 'completed' as const,
  identity: 'anonymous' as const,
  subscriberUuid: null,
  subscriberEmail: null,
  subscriberName: null,
  smsNumber: null,
  networkIdentityLabel: 'Network deadbeef (2026-07)',
  firstPagePath: '/workshop/example',
  firstPageTitle: 'Example',
  lastPagePath: '/workshop/example',
  messageCount: 2,
  lastMessageAt: new Date('2026-07-09T18:43:00.000Z'),
  latestGenerationStatus: 'completed',
  createdAt: new Date('2026-07-09T18:42:00.000Z'),
  updatedAt: new Date('2026-07-09T18:43:00.000Z'),
  expiresAt: new Date('2026-10-07T18:42:00.000Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(guardAdmin).mockResolvedValue({
    uuid: '123e4567-e89b-42d3-a456-426614174099',
    email: 'admin@example.com',
    name: null,
  })
  vi.mocked(listBellConversations).mockResolvedValue({
    conversations: [],
    nextCursor: null,
  })
})

describe('Bell admin guard', () => {
  it('returns 403 from every handler when the visitor is not an admin', async () => {
    vi.mocked(guardAdmin).mockResolvedValue(null)

    const responses = await Promise.all([
      listConversations(new NextRequest(BASE)),
      getConversation(new Request(`${BASE}/${CONVERSATION_ID}`), context()),
      deleteConversation(
        new Request(`${BASE}/${CONVERSATION_ID}`, { method: 'DELETE' }),
        context()
      ),
      redactConversation(
        new Request(`${BASE}/${CONVERSATION_ID}/redact`, { method: 'POST' }),
        context()
      ),
    ])

    for (const response of responses) {
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'Forbidden' })
    }
    expect(listBellConversations).not.toHaveBeenCalled()
    expect(getBellConversationDetail).not.toHaveBeenCalled()
    expect(deleteBellConversation).not.toHaveBeenCalled()
    expect(redactBellConversation).not.toHaveBeenCalled()
  })
})

describe('GET Bell conversation list', () => {
  it('passes validated cursor filters and serializes safe participant data', async () => {
    vi.mocked(listBellConversations).mockResolvedValue({
      conversations: [summary],
      nextCursor: 'next-page',
    })

    const request = new NextRequest(
      `${BASE}?surface=web&identity=anonymous&status=completed&from=2026-07-01&to=2026-07-09&q=deadbeef&cursor=current-page`
    )
    const response = await listConversations(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(listBellConversations).toHaveBeenCalledWith({
      surface: 'web',
      identity: 'anonymous',
      status: 'completed',
      dateFrom: new Date('2026-07-01T00:00:00.000Z'),
      dateTo: new Date('2026-07-10T00:00:00.000Z'),
      search: 'deadbeef',
      cursor: 'current-page',
      limit: 25,
    })

    const json = await response.json()
    expect(json.nextCursor).toBe('next-page')
    expect(json.conversations[0]).toEqual({
      id: CONVERSATION_ID,
      surface: 'web',
      identity: 'anonymous',
      status: 'completed',
      participantLabel: 'Network deadbeef (2026-07)',
      participantDetail: null,
      phoneNumber: null,
      firstPagePath: '/workshop/example',
      firstPageTitle: 'Example',
      messageCount: 2,
      latestGenerationStatus: 'completed',
      firstActivityAt: '2026-07-09T18:42:00.000Z',
      lastActivityAt: '2026-07-09T18:43:00.000Z',
      expiresAt: '2026-10-07T18:42:00.000Z',
    })
    expect(json.conversations[0]).not.toHaveProperty('networkIdentityHash')
    expect(json.conversations[0]).not.toHaveProperty('subscriberUuid')
  })

  it('rejects invalid filters before querying the database', async () => {
    const requests = [
      new NextRequest(`${BASE}?surface=carrier-pigeon`),
      new NextRequest(`${BASE}?identity=email`),
      new NextRequest(`${BASE}?status=deleted`),
      new NextRequest(`${BASE}?from=2026-02-30`),
      new NextRequest(`${BASE}?from=2026-07-10&to=2026-07-09`),
      new NextRequest(`${BASE}?cursor=${'x'.repeat(501)}`),
    ]

    for (const request of requests) {
      const response = await listConversations(request)
      expect(response.status).toBe(400)
    }
    expect(listBellConversations).not.toHaveBeenCalled()
  })
})

describe('Bell conversation detail and mutations', () => {
  it('returns 404 for a missing conversation and 400 for an invalid id', async () => {
    vi.mocked(getBellConversationDetail).mockResolvedValue(null)

    const missing = await getConversation(
      new Request(`${BASE}/${CONVERSATION_ID}`),
      context()
    )
    expect(missing.status).toBe(404)

    const invalid = await getConversation(
      new Request(`${BASE}/not-an-id`),
      context('not-an-id')
    )
    expect(invalid.status).toBe(400)
    expect(getBellConversationDetail).toHaveBeenCalledTimes(1)
  })

  it('returns content and aggregate metadata without raw message parts', async () => {
    vi.mocked(getBellConversationDetail).mockResolvedValue({
      conversation: summary,
      messages: [
        {
          id: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          role: 'assistant',
          authorKind: 'bell',
          content: 'A useful answer.',
          parts: [
            {
              type: 'tool-searchPosts',
              input: { query: 'private raw query' },
            },
          ],
          clientMessageId: null,
          sourceTextMessageId: null,
          replyToMessageId: null,
          status: 'completed',
          createdAt: new Date('2026-07-09T18:43:00.000Z'),
          updatedAt: new Date('2026-07-09T18:43:00.000Z'),
          expiresAt: new Date('2026-10-07T18:42:00.000Z'),
          redactedAt: null,
          deletedAt: null,
        },
      ],
      generations: [
        {
          id: GENERATION_ID,
          requestId: null,
          conversationId: CONVERSATION_ID,
          userMessageId: null,
          assistantMessageId: MESSAGE_ID,
          status: 'completed',
          model: 'openai/gpt-5.6-luna',
          provider: 'openai',
          callId: 'call_safe',
          gatewayGenerationId: 'gen_safe',
          traceId: 'trace_safe',
          workflowRunId: null,
          inputTokens: 100,
          outputTokens: 20,
          totalTokens: 120,
          cachedInputTokens: 0,
          reasoningTokens: 0,
          costUsd: 0.0012,
          latencyMs: 900,
          finishReason: 'stop',
          toolsUsed: ['searchPosts'],
          errorCode: null,
          errorMessage: null,
          startedAt: new Date('2026-07-09T18:42:59.100Z'),
          finishedAt: new Date('2026-07-09T18:43:00.000Z'),
          createdAt: new Date('2026-07-09T18:42:59.000Z'),
          updatedAt: new Date('2026-07-09T18:43:00.000Z'),
          expiresAt: new Date('2026-10-07T18:42:00.000Z'),
          deletedAt: null,
        },
      ],
    })

    const response = await getConversation(
      new Request(`${BASE}/${CONVERSATION_ID}`),
      context()
    )
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.messages[0].content).toBe('A useful answer.')
    expect(json.messages[0]).not.toHaveProperty('parts')
    expect(json.generations[0]).toMatchObject({
      model: 'openai/gpt-5.6-luna',
      totalTokens: 120,
      costUsd: 0.0012,
      tools: [{ name: 'searchPosts', status: null }],
    })
    expect(JSON.stringify(json)).not.toContain('private raw query')
  })

  it('redacts and deletes through explicit mutation handlers', async () => {
    vi.mocked(redactBellConversation).mockResolvedValue(true)
    vi.mocked(deleteBellConversation).mockResolvedValue(true)

    const redacted = await redactConversation(
      new Request(`${BASE}/${CONVERSATION_ID}/redact`, { method: 'POST' }),
      context()
    )
    const deleted = await deleteConversation(
      new Request(`${BASE}/${CONVERSATION_ID}`, { method: 'DELETE' }),
      context()
    )

    expect(redacted.status).toBe(200)
    expect(await redacted.json()).toEqual({ ok: true })
    expect(redactBellConversation).toHaveBeenCalledWith(CONVERSATION_ID)
    expect(deleted.status).toBe(200)
    expect(await deleted.json()).toEqual({ ok: true })
    expect(deleteBellConversation).toHaveBeenCalledWith(CONVERSATION_ID)
  })
})
