import { streamText } from 'ai'
import { checkBotId } from 'botid/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return { ...actual, streamText: vi.fn() }
})
vi.mock('botid/server', () => ({
  checkBotId: vi.fn(async () => ({ isBot: false })),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitStatus: vi.fn(async () => 'allowed'),
}))
vi.mock('@/lib/auth/jwt', () => ({
  getSession: vi.fn(async () => null),
}))
vi.mock('@/lib/chat/bell-generation', () => ({
  bellGatewayCost: vi.fn(),
  bellModel: {},
  bellReasoning: 'none',
  bellStopWhen: [],
  bellTools: {},
  getBellProviderOptions: vi.fn(() => ({})),
  prepareBellStep: vi.fn(),
}))
vi.mock('@/lib/db/queries/bell-conversations', () => ({
  createWebBellTurn: vi.fn(),
  getOrCreateWebBellConversation: vi.fn(),
}))
vi.mock('@/lib/db/queries/bell-generations', () => ({
  abortBellGeneration: vi.fn(),
  completeBellGeneration: vi.fn(),
  failBellGeneration: vi.fn(),
  markBellGenerationRunning: vi.fn(),
  setBellGenerationAssistantMessageId: vi.fn(),
}))
vi.mock('@/lib/db/queries/bell-messages', () => ({
  createBellMessage: vi.fn(),
  textFromBellParts: vi.fn(() => 'Hello'),
}))
vi.mock('@/lib/db/queries/subscribers', () => ({ findByUuid: vi.fn() }))

import { CHAT_BODY_MAX_BYTES, POST } from '@/app/api/chat/route'
import { findByUuid } from '@/lib/db/queries/subscribers'
import { checkRateLimitStatus } from '@/lib/rate-limit'

const rateLimit = vi.mocked(checkRateLimitStatus)
const botId = vi.mocked(checkBotId)
const findSubscriber = vi.mocked(findByUuid)
const model = vi.mocked(streamText)

const validBody = {
  id: '11111111-1111-4111-8111-111111111111',
  requestId: '22222222-2222-4222-8222-222222222222',
  messages: [
    {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hello Bell' }],
    },
  ],
  trigger: 'submit-message',
  messageId: 'u1',
  pageContext: { path: '/contact', title: 'Contact' },
} as const

function chatRequest(body: BodyInit, contentType = 'application/json') {
  return new Request('https://example.com/api/chat', {
    method: 'POST',
    headers: {
      'content-type': contentType,
      'x-vercel-forwarded-for': '203.0.113.9',
    },
    body,
  })
}

describe('POST /api/chat request bounds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimit.mockResolvedValue('allowed')
    botId.mockResolvedValue({
      isBot: false,
    } as Awaited<ReturnType<typeof checkBotId>>)
  })

  it('rejects malformed JSON before security, database, or model calls', async () => {
    const response = await POST(chatRequest('{'))

    expect(response.status).toBe(400)
    expect(rateLimit).not.toHaveBeenCalled()
    expect(botId).not.toHaveBeenCalled()
    expect(findSubscriber).not.toHaveBeenCalled()
    expect(model).not.toHaveBeenCalled()
  })

  it('rejects oversized bodies before security, database, or model calls', async () => {
    const response = await POST(
      chatRequest(
        JSON.stringify({
          ...validBody,
          messages: [
            {
              id: 'u1',
              role: 'user',
              parts: [{ type: 'text', text: 'x'.repeat(CHAT_BODY_MAX_BYTES) }],
            },
          ],
        })
      )
    )

    expect(response.status).toBe(413)
    expect(rateLimit).not.toHaveBeenCalled()
    expect(botId).not.toHaveBeenCalled()
    expect(findSubscriber).not.toHaveBeenCalled()
    expect(model).not.toHaveBeenCalled()
  })

  it('rejects a non-JSON media type before downstream work', async () => {
    const response = await POST(
      chatRequest(JSON.stringify(validBody), 'text/plain')
    )

    expect(response.status).toBe(415)
    expect(rateLimit).not.toHaveBeenCalled()
    expect(botId).not.toHaveBeenCalled()
    expect(findSubscriber).not.toHaveBeenCalled()
    expect(model).not.toHaveBeenCalled()
  })

  it('returns 429 without database or model work when limited', async () => {
    rateLimit.mockResolvedValue('limited')

    const response = await POST(chatRequest(JSON.stringify(validBody)))

    expect(response.status).toBe(429)
    expect(rateLimit).toHaveBeenCalledWith(
      'chat',
      'ip:203.0.113.9',
      expect.any(Request)
    )
    expect(findSubscriber).not.toHaveBeenCalled()
    expect(model).not.toHaveBeenCalled()
  })

  it('drops malformed page context without rejecting the Bell request', async () => {
    rateLimit.mockResolvedValue('limited')
    const response = await POST(
      chatRequest(
        JSON.stringify({
          ...validBody,
          pageContext: {
            path: `/${'x'.repeat(500)}`,
            title: null,
            injected: 'ignored',
          },
        })
      )
    )

    expect(response.status).toBe(429)
    expect(rateLimit).toHaveBeenCalledOnce()
  })

  it('keeps long browser histories by sanitizing only their newest window', async () => {
    rateLimit.mockResolvedValue('limited')
    const response = await POST(
      chatRequest(
        JSON.stringify({
          ...validBody,
          messages: Array.from({ length: 105 }, (_, index) => ({
            id: `message-${index}`,
            role: index % 2 === 0 ? 'user' : 'assistant',
            parts: [{ type: 'text', text: `Message ${index}` }],
          })),
        })
      )
    )

    expect(response.status).toBe(429)
    expect(rateLimit).toHaveBeenCalledOnce()
  })

  it('returns 503 without database or model work when limiting is unavailable', async () => {
    rateLimit.mockResolvedValue('unavailable')

    const response = await POST(chatRequest(JSON.stringify(validBody)))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'Bell is temporarily unavailable. Please try again later.',
    })
    expect(findSubscriber).not.toHaveBeenCalled()
    expect(model).not.toHaveBeenCalled()
  })
})
