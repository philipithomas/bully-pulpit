import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@/lib/chat/bell-generation', () => ({
  bellGatewayCost: vi.fn(async () => ({
    gatewayGenerationId: null,
    costUsd: null,
  })),
  bellModel: 'test-model',
  bellReasoning: 'none',
  bellStopWhen: 'stop-condition',
  bellTools: { searchPosts: {} },
  getBellProviderOptions: vi.fn(() => ({ gateway: {} })),
  prepareBellStep: vi.fn(),
}))
vi.mock('@/lib/chat/bell-identity', () => ({
  smsIdentityHash: vi.fn(() => 'sms-hash'),
}))
vi.mock('@/lib/db/queries/text-messages', () => ({
  createTextMessageWithStatus: vi.fn(),
  findTextMessageById: vi.fn(),
  recentConversationWith: vi.fn(),
}))
vi.mock('@/lib/db/queries/bell-generations', () => ({
  completeBellGeneration: vi.fn(),
  failBellGeneration: vi.fn(),
  markBellGenerationRunning: vi.fn(),
  setBellGenerationAssistantMessageId: vi.fn(),
}))
vi.mock('@/lib/db/queries/bell-messages', () => ({
  createBellMessage: vi.fn(),
  updateBellMessage: vi.fn(),
}))
vi.mock('@/lib/phone/twilio', () => ({ sendSms: vi.fn() }))

import { generateText } from 'ai'
import { getBellProviderOptions } from '@/lib/chat/bell-generation'
import { createBellMessage } from '@/lib/db/queries/bell-messages'
import {
  createTextMessageWithStatus,
  findTextMessageById,
  recentConversationWith,
} from '@/lib/db/queries/text-messages'
import type { TextMessage } from '@/lib/db/schema'
import {
  BELL_SMS_MAX_GSM_UNITS,
  BELL_SMS_MAX_UCS2_UNITS,
  BELL_SMS_PREFIX,
  buildBellSmsPrompt,
  FALLBACK_BELL_SMS_BODY,
  formatBellSmsBody,
  generateBellSmsBody,
  recordBellSms,
  sendBellSmsBody,
  smsUnits,
} from '@/lib/phone/bell-sms'
import { sendSms } from '@/lib/phone/twilio'

const INPUT = {
  from: '+15551234567',
  to: '+12123473190',
  inboundMessageId: 9,
  conversationId: '11111111-1111-4111-8111-111111111111',
  userMessageId: '22222222-2222-4222-8222-222222222222',
  generationId: '33333333-3333-4333-8333-333333333333',
}

function message(
  id: number,
  direction: 'inbound' | 'outbound',
  body: string
): TextMessage {
  return {
    id,
    fromNumber: direction === 'inbound' ? INPUT.from : INPUT.to,
    toNumber: direction === 'inbound' ? INPUT.to : INPUT.from,
    body,
    direction,
    twilioSid: `SM${id}`,
    replyToMessageId: null,
    status: direction === 'inbound' ? 'received' : 'queued',
    createdAt: new Date(`2026-07-09T17:0${id}:00.000Z`),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(findTextMessageById).mockResolvedValue(
    message(9, 'inbound', 'Hello')
  )
  vi.mocked(recentConversationWith).mockResolvedValue([])
  vi.mocked(sendSms).mockResolvedValue({ sid: 'SM_REPLY', status: 'queued' })
  vi.mocked(createBellMessage).mockResolvedValue({
    message: {
      id: '44444444-4444-4444-8444-444444444444',
      conversationId: INPUT.conversationId,
    },
    inserted: true,
    // biome-ignore lint/suspicious/noExplicitAny: focused persistence stub
  } as any)
  vi.mocked(createTextMessageWithStatus).mockResolvedValue({
    message: message(10, 'outbound', '[Bell AI] Hello'),
    inserted: true,
  })
})

describe('SMS encoding budget', () => {
  it('counts GSM extension characters as two units', () => {
    expect(smsUnits(`${BELL_SMS_PREFIX} `)).toEqual({
      encoding: 'GSM-7',
      units: 12,
    })
  })

  it('keeps a long GSM reply inside the two-segment budget', () => {
    const body = formatBellSmsBody('word '.repeat(200))
    expect(body).toMatch(/^\[Bell AI\] /)
    expect(body).toContain('...')
    expect(body).not.toContain('Reply STOP')
    expect(smsUnits(body)).toMatchObject({
      encoding: 'GSM-7',
      units: expect.any(Number),
    })
    expect(smsUnits(body).units).toBeLessThanOrEqual(BELL_SMS_MAX_GSM_UNITS)
  })

  it('keeps Unicode intact without splitting a surrogate pair', () => {
    const body = formatBellSmsBody(`A dog 🐕 ${'long '.repeat(80)}`)
    const measurement = smsUnits(body)
    expect(measurement.encoding).toBe('UCS-2')
    expect(measurement.units).toBeLessThanOrEqual(BELL_SMS_MAX_UCS2_UNITS)
    expect(body).not.toMatch(/[\uD800-\uDBFF]$/)
    expect(body).not.toContain('Reply STOP')
  })

  it('does not let Unicode beyond the retained prefix shrink a GSM reply', () => {
    const body = formatBellSmsBody(`${'a'.repeat(400)}🐕`)
    const measurement = smsUnits(body)
    expect(measurement.encoding).toBe('GSM-7')
    expect(measurement.units).toBe(BELL_SMS_MAX_GSM_UNITS)
  })

  it('does not split a joined emoji grapheme', () => {
    const body = formatBellSmsBody(`${'a '.repeat(58)}👨‍👩‍👧‍👦 more words`)
    expect(smsUnits(body).units).toBeLessThanOrEqual(BELL_SMS_MAX_UCS2_UNITS)
    expect(body).not.toMatch(/\u200d\.\.\.$/)
  })
})

describe('formatBellSmsBody', () => {
  it('scrubs leaked tool JSON and converts Markdown links to plain text', () => {
    const body = formatBellSmsBody(
      '{"query":"hello"}\n## **Read** [the post](/hello). “Useful”—brief…'
    )
    expect(body).toBe(
      '[Bell AI] Read the post (https://www.philipithomas.com/hello). "Useful"-brief...'
    )
    expect(body).not.toContain('**')
    expect(body).not.toContain('](')
  })

  it('adds the prefix exactly once and falls back on empty output', () => {
    expect(formatBellSmsBody('[Bell AI] Hello')).toBe('[Bell AI] Hello')
    expect(formatBellSmsBody('   ')).toBe(FALLBACK_BELL_SMS_BODY)
  })

  it('removes the legacy opt-out footer from reply-only messages', () => {
    const body = formatBellSmsBody(
      'Hello philipithomas.com: Reply STOP to end. philipithomas.com: Reply STOP to end.'
    )

    expect(body).toBe('[Bell AI] Hello')
  })

  it('preserves autolinks while removing strikethrough and table pipes', () => {
    expect(
      formatBellSmsBody(
        'See <https://www.philipithomas.com/contact> and ~~ignore~~ | pipes.'
      )
    ).toBe(
      '[Bell AI] See https://www.philipithomas.com/contact and ignore pipes.'
    )
  })

  it('drops a URL rather than sending a truncated one', () => {
    const body = formatBellSmsBody(
      `${'Context '.repeat(22)}https://www.philipithomas.com/${'long-slug-'.repeat(30)}`
    )
    expect(body).toContain('...')
    expect(body).not.toContain('Reply STOP')
    expect(body).not.toContain('https://')
  })

  it('scrubs every current Bell tool-input shape', () => {
    expect(
      formatBellSmsBody(
        '{"path":"/contact"}{"query":"coffee","scope":"images"}Answer.'
      )
    ).toBe('[Bell AI] Answer.')
  })
})

describe('Bell SMS generation and delivery', () => {
  it('labels automated outbound notices in recent context', () => {
    const prompt = buildBellSmsPrompt([
      message(1, 'outbound', 'Postcard: A new message'),
      message(2, 'inbound', 'What was that?'),
      message(3, 'outbound', '[Bell AI] It was the July Postcard.'),
      message(4, 'inbound', 'Tell me more'),
    ])
    expect(prompt).toContain(
      'Previously sent from philipithomas.com (automated or human): Postcard: A new message'
    )
    expect(prompt).toContain('Bell: [Bell AI] It was the July Postcard.')
    expect(prompt).toContain('Visitor: Tell me more')
  })

  it('keeps the complete current 1600-character inbound message', () => {
    const current = `${'x'.repeat(1_590)}final-tail`
    const prompt = buildBellSmsPrompt([message(1, 'inbound', current)])

    expect(current).toHaveLength(1_600)
    expect(prompt).toContain(current)
  })

  it('passes recent thread context to the shared Bell tool loop', async () => {
    vi.mocked(recentConversationWith).mockResolvedValue([
      message(1, 'outbound', 'Workshop: A new message'),
      message(2, 'inbound', 'What is this about?'),
    ])
    vi.mocked(generateText).mockResolvedValue({
      text: 'It is about the new Workshop post.',
      steps: [],
      finalStep: {
        model: { modelId: 'test-model', provider: 'test-provider' },
        callId: 'call-1',
      },
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        inputTokenDetails: { cacheReadTokens: 0 },
        outputTokenDetails: { reasoningTokens: 0 },
      },
      finishReason: 'stop',
      // biome-ignore lint/suspicious/noExplicitAny: partial generateText result
    } as any)

    await expect(generateBellSmsBody(INPUT)).resolves.toEqual({
      body: '[Bell AI] It is about the new Workshop post.',
      assistantMessageId: '44444444-4444-4444-8444-444444444444',
    })
    expect(recentConversationWith).toHaveBeenCalledWith(INPUT.from, 9)
    const call = vi.mocked(generateText).mock.calls[0][0]
    expect(call.prompt).toContain('Workshop: A new message')
    expect(call.system).toContain('Reply in one compact plain-text paragraph')
    expect(call.maxOutputTokens).toBe(256)
    expect(call.reasoning).toBe('none')
    expect(call.tools).toEqual({ searchPosts: {} })
    expect(call.telemetry).toMatchObject({
      recordInputs: false,
      recordOutputs: false,
    })
    expect(getBellProviderOptions).toHaveBeenCalledWith({
      surface: 'sms',
      pseudonymousUser: 'sms:sms-hash',
    })
    expect(createBellMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        authorKind: 'bell',
        clientMessageId: `generation:${INPUT.generationId}`,
        replyToMessageId: INPUT.userMessageId,
      })
    )
  })

  it('sends the reply from the Twilio number', async () => {
    const body = '[Bell AI] Hello'
    await expect(sendBellSmsBody(INPUT, body)).resolves.toEqual({
      sid: 'SM_REPLY',
      status: 'queued',
    })

    expect(sendSms).toHaveBeenCalledWith({
      from: INPUT.to,
      to: INPUT.from,
      body,
    })
    expect(createTextMessageWithStatus).not.toHaveBeenCalled()
  })

  it('does not send or recreate a reply after STOP deletes the source message', async () => {
    vi.mocked(findTextMessageById).mockResolvedValue(null)

    await expect(sendBellSmsBody(INPUT, '[Bell AI] Hello')).resolves.toBeNull()
    await recordBellSms(INPUT, '[Bell AI] Hello', null)

    expect(sendSms).not.toHaveBeenCalled()
    expect(createTextMessageWithStatus).not.toHaveBeenCalled()
  })

  it('records the durable result against the inbound message', async () => {
    const body = '[Bell AI] Hello'
    await recordBellSms(INPUT, body, { sid: 'SM_REPLY', status: 'queued' })

    expect(createTextMessageWithStatus).toHaveBeenCalledWith({
      fromNumber: INPUT.to,
      toNumber: INPUT.from,
      body,
      direction: 'outbound',
      twilioSid: 'SM_REPLY',
      replyToMessageId: INPUT.inboundMessageId,
      status: 'queued',
    })
    expect(createBellMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        authorKind: 'bell',
        sourceTextMessageId: 10,
        replyToMessageId: INPUT.userMessageId,
        status: 'completed',
      })
    )
  })
})
