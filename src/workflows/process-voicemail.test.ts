import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('workflow', () => ({
  getStepMetadata: vi.fn(() => ({ stepId: 'step/voicemail-claim' })),
}))
vi.mock('@/lib/db/queries/phone-webhook-events', () => ({
  markPhoneWebhookEventProcessed: vi.fn(),
}))
vi.mock('@/lib/phone/voicemail', () => ({
  processVoicemail: vi.fn(),
}))

import { markPhoneWebhookEventProcessed } from '@/lib/db/queries/phone-webhook-events'
import { processVoicemail } from '@/lib/phone/voicemail'
import {
  type ProcessVoicemailWorkflowInput,
  processVoicemailWorkflow,
} from '@/workflows/process-voicemail'

const input: ProcessVoicemailWorkflowInput = {
  webhookEventId: 42,
  webhookLease: '2026-07-09T12:34:56.789Z',
  voicemail: {
    recordingUrl: 'https://api.twilio.com/recordings/RE123',
    recordingSid: 'RE123',
    from: '+15551234567',
    to: '+12123473190',
    durationSeconds: '42',
  },
}

describe('processVoicemailWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(markPhoneWebhookEventProcessed).mockResolvedValue(true)
    vi.mocked(processVoicemail).mockResolvedValue('sent')
  })

  it('lets the exact webhook lease winner process the voicemail', async () => {
    await expect(processVoicemailWorkflow(input)).resolves.toBe('sent')

    expect(markPhoneWebhookEventProcessed).toHaveBeenCalledWith(
      42,
      new Date('2026-07-09T12:34:56.789Z'),
      'step/voicemail-claim'
    )
    expect(processVoicemail).toHaveBeenCalledWith(input.voicemail)
  })

  it('stops before side effects when another run owns or consumed the lease', async () => {
    vi.mocked(markPhoneWebhookEventProcessed).mockResolvedValueOnce(false)

    await expect(processVoicemailWorkflow(input)).resolves.toBe('duplicate')

    expect(markPhoneWebhookEventProcessed).toHaveBeenCalledOnce()
    expect(processVoicemail).not.toHaveBeenCalled()
  })

  it('rejects an invalid serialized lease without touching the database', async () => {
    await expect(
      processVoicemailWorkflow({ ...input, webhookLease: 'not-a-date' })
    ).resolves.toBe('duplicate')

    expect(markPhoneWebhookEventProcessed).not.toHaveBeenCalled()
    expect(processVoicemail).not.toHaveBeenCalled()
  })
})
