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

import { getStepMetadata, RetryableError } from 'workflow'
import {
  generateBellSmsBody,
  recordBellSms,
  sendBellSmsBody,
} from '@/lib/phone/bell-sms'
import { fixedBellSmsBody } from '@/lib/phone/bell-sms-copy'
import { TwilioApiError } from '@/lib/phone/twilio'
import {
  recordBellSmsStep,
  replyToSmsWorkflow,
  sendBellSmsStep,
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
  })

  it('sends a fixed fallback after generation exhausts its retries', async () => {
    vi.mocked(generateBellSmsBody).mockRejectedValue(new Error('gateway down'))

    await replyToSmsWorkflow(INPUT)

    expect(sendBellSmsBody).toHaveBeenCalledWith(
      INPUT,
      fixedBellSmsBody('I could not answer that right now. Please try again.')
    )
  })

  it('records a failed row after delivery exhausts its retries', async () => {
    vi.mocked(generateBellSmsBody).mockResolvedValue(GENERATED)
    vi.mocked(sendBellSmsBody).mockRejectedValue(new TypeError('network down'))

    await replyToSmsWorkflow(INPUT)

    expect(recordBellSms).toHaveBeenCalledWith(
      INPUT,
      '[Bell AI] Answer',
      null,
      GENERATED.assistantMessageId
    )
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

    await recordBellSmsStep(INPUT, '[Bell AI] Answer', result)

    expect(recordBellSms).toHaveBeenCalledWith(
      INPUT,
      '[Bell AI] Answer',
      result,
      undefined
    )
    expect(sendBellSmsBody).not.toHaveBeenCalled()
  })
})
