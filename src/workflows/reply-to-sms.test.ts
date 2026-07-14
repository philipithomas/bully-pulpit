import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('workflow', async (importActual) => {
  const actual = await importActual<typeof import('workflow')>()
  return { ...actual, getStepMetadata: vi.fn() }
})
vi.mock('@/lib/phone/bell-sms', () => ({
  generateBellSmsBody: vi.fn(),
  recordBellSms: vi.fn(),
  sendBellSmsBody: vi.fn(),
}))
vi.mock('@/lib/db/queries/text-messages', () => ({
  findTextMessageById: vi.fn(),
}))
vi.mock('@/lib/phone/notifications', () => ({
  sendIncomingSmsNotification: vi.fn(),
}))

import { getStepMetadata, RetryableError } from 'workflow'
import { findTextMessageById } from '@/lib/db/queries/text-messages'
import {
  generateBellSmsBody,
  recordBellSms,
  sendBellSmsBody,
} from '@/lib/phone/bell-sms'
import { fixedBellSmsBody } from '@/lib/phone/bell-sms-copy'
import { sendIncomingSmsNotification } from '@/lib/phone/notifications'
import { TwilioApiError } from '@/lib/phone/twilio'
import {
  recordBellSmsStep,
  replyToSmsWorkflow,
  sendBellSmsStep,
  sendIncomingSmsNotificationStep,
} from '@/workflows/reply-to-sms'

const INPUT = {
  from: '+15551234567',
  to: '+12123473190',
  inboundMessageId: 42,
  conversationId: '11111111-1111-4111-8111-111111111111',
  userMessageId: '22222222-2222-4222-8222-222222222222',
  generationId: '33333333-3333-4333-8333-333333333333',
}

const GENERATED = {
  body: '[Bell AI] Answer',
  assistantMessageId: '44444444-4444-4444-8444-444444444444',
}

const RECEIVED_AT = new Date('2026-07-13T20:30:00.000Z')

const INBOUND = {
  id: INPUT.inboundMessageId,
  fromNumber: INPUT.from,
  toNumber: INPUT.to,
  body: 'What is new?',
  direction: 'inbound' as const,
  twilioSid: 'SM_INBOUND',
  replyToMessageId: null,
  status: 'received',
  createdAt: RECEIVED_AT,
}

const RECORDED = {
  id: 43,
  fromNumber: INPUT.to,
  toNumber: INPUT.from,
  body: GENERATED.body,
  direction: 'outbound' as const,
  twilioSid: 'SM_REPLY',
  replyToMessageId: INPUT.inboundMessageId,
  status: 'queued',
  createdAt: new Date('2026-07-13T20:30:05.000Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getStepMetadata).mockReturnValue({
    stepName: 'sendBellSmsStep',
    stepId: 'step-1',
    stepStartedAt: new Date(),
    attempt: 1,
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(sendBellSmsBody).mockResolvedValue({
    sid: 'SM_REPLY',
    status: 'queued',
  })
  vi.mocked(findTextMessageById).mockResolvedValue(INBOUND)
  vi.mocked(recordBellSms).mockResolvedValue(RECORDED)
  vi.mocked(sendIncomingSmsNotification).mockResolvedValue()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('replyToSmsWorkflow', () => {
  it('generates once and sends the stable body', async () => {
    vi.mocked(generateBellSmsBody).mockResolvedValue(GENERATED)

    await replyToSmsWorkflow(INPUT)

    expect(generateBellSmsBody).toHaveBeenCalledWith(INPUT)
    expect(sendBellSmsBody).toHaveBeenCalledWith(INPUT, '[Bell AI] Answer')
    expect(recordBellSms).toHaveBeenCalledWith(
      INPUT,
      '[Bell AI] Answer',
      {
        sid: 'SM_REPLY',
        status: 'queued',
      },
      GENERATED.assistantMessageId
    )
    expect(sendIncomingSmsNotification).toHaveBeenCalledWith({
      from: INPUT.from,
      to: INPUT.to,
      body: INBOUND.body,
      bellResponse: GENERATED.body,
      bellReplyFailed: false,
      receivedAt: RECEIVED_AT,
    })
    expect(vi.mocked(recordBellSms).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(sendIncomingSmsNotification).mock.invocationCallOrder[0]
    )
  })

  it('sends a fixed fallback after generation exhausts its retries', async () => {
    vi.mocked(generateBellSmsBody).mockRejectedValue(new Error('gateway down'))
    const fallback = fixedBellSmsBody(
      'I could not answer that right now. Please try again.'
    )
    vi.mocked(recordBellSms).mockResolvedValue({
      ...RECORDED,
      body: fallback,
    })

    await replyToSmsWorkflow(INPUT)

    expect(sendBellSmsBody).toHaveBeenCalledWith(INPUT, fallback)
    expect(sendIncomingSmsNotification).toHaveBeenCalledWith(
      expect.objectContaining({ bellResponse: fallback })
    )
  })

  it('records a failed row after delivery exhausts its retries', async () => {
    vi.mocked(generateBellSmsBody).mockResolvedValue(GENERATED)
    vi.mocked(sendBellSmsBody).mockRejectedValue(new TypeError('network down'))
    vi.mocked(recordBellSms).mockResolvedValue({
      ...RECORDED,
      twilioSid: null,
      status: 'failed',
    })

    await replyToSmsWorkflow(INPUT)

    expect(recordBellSms).toHaveBeenCalledWith(
      INPUT,
      '[Bell AI] Answer',
      null,
      GENERATED.assistantMessageId
    )
    expect(sendIncomingSmsNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        bellResponse: GENERATED.body,
        bellReplyFailed: true,
      })
    )
  })

  it('emails the canonical recorded reply when another run won persistence', async () => {
    vi.mocked(generateBellSmsBody).mockResolvedValue(GENERATED)
    vi.mocked(recordBellSms).mockResolvedValue({
      ...RECORDED,
      body: '[Bell AI] Earlier answer',
    })

    await replyToSmsWorkflow(INPUT)

    expect(sendIncomingSmsNotification).toHaveBeenCalledWith(
      expect.objectContaining({ bellResponse: '[Bell AI] Earlier answer' })
    )
  })

  it('skips the email when STOP deleted the inbound message', async () => {
    vi.mocked(generateBellSmsBody).mockResolvedValue(GENERATED)
    vi.mocked(findTextMessageById).mockResolvedValue(null)

    await replyToSmsWorkflow(INPUT)

    expect(sendIncomingSmsNotification).not.toHaveBeenCalled()
  })

  it('does not replay Bell when the notification fails', async () => {
    vi.mocked(generateBellSmsBody).mockResolvedValue(GENERATED)
    vi.mocked(sendIncomingSmsNotification).mockRejectedValue(
      new Error('SES offline')
    )

    await expect(replyToSmsWorkflow(INPUT)).resolves.toBeUndefined()

    expect(generateBellSmsBody).toHaveBeenCalledTimes(1)
    expect(sendBellSmsBody).toHaveBeenCalledTimes(1)
    expect(recordBellSms).toHaveBeenCalledTimes(1)
    expect(sendIncomingSmsNotification).toHaveBeenCalledTimes(1)
  })
})

describe('sendBellSmsStep', () => {
  it('retries transient Twilio failures', async () => {
    vi.mocked(sendBellSmsBody).mockRejectedValue(
      new TwilioApiError('rate limited', 429)
    )

    await expect(
      sendBellSmsStep(INPUT, '[Bell AI] Answer')
    ).rejects.toBeInstanceOf(RetryableError)
    expect(recordBellSms).not.toHaveBeenCalled()
  })

  it('returns permanent Twilio failures for separate recording', async () => {
    vi.mocked(sendBellSmsBody).mockRejectedValue(
      new TwilioApiError('invalid recipient', 400)
    )

    await expect(sendBellSmsStep(INPUT, '[Bell AI] Answer')).resolves.toBeNull()
    expect(recordBellSms).not.toHaveBeenCalled()
  })

  it('records a durable result without calling Twilio again', async () => {
    const result = { sid: 'SM_REPLY', status: 'queued' }

    await expect(
      recordBellSmsStep(INPUT, '[Bell AI] Answer', result)
    ).resolves.toEqual({ body: '[Bell AI] Answer', status: 'queued' })

    expect(recordBellSms).toHaveBeenCalledWith(
      INPUT,
      '[Bell AI] Answer',
      result,
      undefined
    )
    expect(sendBellSmsBody).not.toHaveBeenCalled()
  })
})

describe('sendIncomingSmsNotificationStep', () => {
  it('returns skipped when the inbound row no longer exists', async () => {
    vi.mocked(findTextMessageById).mockResolvedValue(null)

    await expect(
      sendIncomingSmsNotificationStep(INPUT, {
        body: '[Bell AI] Answer',
        status: 'queued',
      })
    ).resolves.toBe('skipped')

    expect(sendIncomingSmsNotification).not.toHaveBeenCalled()
  })
})
