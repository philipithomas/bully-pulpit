import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@/lib/chat/bell-generation', () => ({
  bellModel: 'test-model',
  bellProviderOptions: { gateway: {} },
  bellStopWhen: 'stop-condition',
  bellTools: { searchPosts: {} },
  prepareBellStep: vi.fn(),
}))
vi.mock('@/lib/db/queries/text-messages', () => ({
  createTextMessage: vi.fn(),
  recentConversationWith: vi.fn(),
}))
vi.mock('@/lib/phone/twilio', () => ({ sendSms: vi.fn() }))

import { generateText } from 'ai'
import {
  createTextMessage,
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
  vi.mocked(recentConversationWith).mockResolvedValue([])
  vi.mocked(sendSms).mockResolvedValue({ sid: 'SM_REPLY', status: 'queued' })
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
    expect(body).toMatch(/\.\.\.$/)
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
    expect(body).toMatch(/\.\.\.$/)
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
      // biome-ignore lint/suspicious/noExplicitAny: partial generateText result
    } as any)

    await expect(generateBellSmsBody(INPUT)).resolves.toBe(
      '[Bell AI] It is about the new Workshop post.'
    )
    expect(recentConversationWith).toHaveBeenCalledWith(INPUT.from, 9)
    const call = vi.mocked(generateText).mock.calls[0][0]
    expect(call.prompt).toContain('Workshop: A new message')
    expect(call.system).toContain('Reply in one compact plain-text paragraph')
    expect(call.maxOutputTokens).toBe(256)
    expect(call.tools).toEqual({ searchPosts: {} })
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
    expect(createTextMessage).not.toHaveBeenCalled()
  })

  it('records the durable result against the inbound message', async () => {
    const body = '[Bell AI] Hello'
    await recordBellSms(INPUT, body, { sid: 'SM_REPLY', status: 'queued' })

    expect(createTextMessage).toHaveBeenCalledWith({
      fromNumber: INPUT.to,
      toNumber: INPUT.from,
      body,
      direction: 'outbound',
      twilioSid: 'SM_REPLY',
      replyToMessageId: INPUT.inboundMessageId,
      status: 'queued',
    })
  })
})
