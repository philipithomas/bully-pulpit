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
    vi.mocked(generateBellSmsBody).mockResolvedValue('[Bell AI] Answer')

    await replyToSmsWorkflow(INPUT)

    expect(generateBellSmsBody).toHaveBeenCalledWith(INPUT)
    expect(sendBellSmsBody).toHaveBeenCalledWith(INPUT, '[Bell AI] Answer')
    expect(recordBellSms).toHaveBeenCalledWith(INPUT, '[Bell AI] Answer', {
      sid: 'SM_REPLY',
      status: 'queued',
    })
  })

  it('sends a fixed fallback after generation exhausts its retries', async () => {
    vi.mocked(generateBellSmsBody).mockRejectedValue(new Error('gateway down'))

    await replyToSmsWorkflow(INPUT)

    expect(sendBellSmsBody).toHaveBeenCalledWith(
      INPUT,
      '[Bell AI] I could not answer that right now. Please try again.'
    )
  })

  it('records a failed row after delivery exhausts its retries', async () => {
    vi.mocked(generateBellSmsBody).mockResolvedValue('[Bell AI] Answer')
    vi.mocked(sendBellSmsBody).mockRejectedValue(new TypeError('network down'))

    await replyToSmsWorkflow(INPUT)

    expect(recordBellSms).toHaveBeenCalledWith(INPUT, '[Bell AI] Answer', null)
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
      result
    )
    expect(sendBellSmsBody).not.toHaveBeenCalled()
  })
})
