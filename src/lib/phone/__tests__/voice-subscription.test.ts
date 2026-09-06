import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const afterTasks = vi.hoisted(() => [] as Promise<void>[])
vi.mock('next/server', () => ({
  after: (task: () => Promise<void>) => {
    afterTasks.push(task())
  },
}))

vi.mock('workflow/api', () => ({ start: vi.fn() }))
vi.mock('@/workflows/sms-signup-onboarding', () => ({
  smsSignupOnboardingWorkflow: vi.fn(),
}))
vi.mock('@/lib/phone/notifications', () => ({
  sendSmsSignupNotification: vi.fn(),
}))
vi.mock('@/lib/db/queries/phone-webhook-events', () => ({
  claimPhoneWebhookEvent: vi.fn(),
  findOrCreatePhoneWebhookEvent: vi.fn(),
  markPhoneWebhookEventProcessed: vi.fn(),
  markPhoneWebhookEventSideEffectObserved: vi.fn(),
  releasePhoneWebhookEvent: vi.fn(),
}))
vi.mock('@/lib/db/queries/sms-subscribers', () => ({
  findSmsSubscriberByPhoneNumber: vi.fn(),
  subscribeSmsNumber: vi.fn(),
}))

import { start } from 'workflow/api'
import {
  claimPhoneWebhookEvent,
  findOrCreatePhoneWebhookEvent,
  markPhoneWebhookEventProcessed,
  markPhoneWebhookEventSideEffectObserved,
  releasePhoneWebhookEvent,
} from '@/lib/db/queries/phone-webhook-events'
import {
  findSmsSubscriberByPhoneNumber,
  subscribeSmsNumber,
} from '@/lib/db/queries/sms-subscribers'
import { sendSmsSignupNotification } from '@/lib/phone/notifications'
import { subscribeVoiceCaller } from '@/lib/phone/voice-subscription'

const input = {
  from: '+14155551234',
  to: '+12123473190',
  callSid: 'CA1234567890abcdef1234567890abcdef',
}
const lease = new Date()

function webhook(inserted = true, processedAt: Date | null = null) {
  return {
    inserted,
    event: { id: 1, processedAt, eventType: 'voice-menu' },
  } as Awaited<ReturnType<typeof findOrCreatePhoneWebhookEvent>>
}

beforeEach(() => {
  afterTasks.length = 0
  vi.resetAllMocks()
  vi.stubEnv('PHONE_NUMBER', input.to)
  vi.mocked(findOrCreatePhoneWebhookEvent).mockResolvedValue(webhook())
  vi.mocked(claimPhoneWebhookEvent).mockResolvedValue(lease)
  vi.mocked(markPhoneWebhookEventProcessed).mockResolvedValue(true)
  vi.mocked(markPhoneWebhookEventSideEffectObserved).mockResolvedValue(true)
  vi.mocked(findSmsSubscriberByPhoneNumber).mockResolvedValue(null)
})
afterEach(async () => {
  await Promise.all(afterTasks.splice(0))
  vi.unstubAllEnvs()
})

describe('shared voice subscription', () => {
  it('shares the keypad event key and sends onboarding plus one admin notice for a new signup', async () => {
    expect(await subscribeVoiceCaller(input)).toBe('subscribed')
    expect(findOrCreatePhoneWebhookEvent).toHaveBeenCalledWith({
      eventKey: `voice-menu:${input.callSid}:2`,
      eventType: 'voice-menu',
    })
    expect(subscribeSmsNumber).toHaveBeenCalledWith({
      phoneNumber: input.from,
      source: 'call:phone',
    })
    expect(start).toHaveBeenCalledWith(expect.any(Function), [
      { from: input.to, to: input.from, sendConfirmation: true },
    ])
    expect(markPhoneWebhookEventProcessed).toHaveBeenCalledWith(1, lease)
    expect(sendSmsSignupNotification).toHaveBeenCalledTimes(1)
  })

  it('labels a speech signup accurately while retaining the shared keypad event key', async () => {
    expect(await subscribeVoiceCaller({ ...input, source: 'voice-bell' })).toBe(
      'subscribed'
    )
    expect(findOrCreatePhoneWebhookEvent).toHaveBeenCalledWith({
      eventKey: `voice-menu:${input.callSid}:2`,
      eventType: 'voice-menu',
    })
    expect(sendSmsSignupNotification).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'voice-bell' })
    )
  })

  it('does not send onboarding again to an active subscriber on a different call', async () => {
    vi.mocked(findSmsSubscriberByPhoneNumber).mockResolvedValue({
      confirmedAt: new Date(),
    } as NonNullable<
      Awaited<ReturnType<typeof findSmsSubscriberByPhoneNumber>>
    >)
    expect(await subscribeVoiceCaller(input)).toBe('already_subscribed')
    expect(start).not.toHaveBeenCalled()
    expect(subscribeSmsNumber).not.toHaveBeenCalled()
    expect(sendSmsSignupNotification).not.toHaveBeenCalled()
    expect(markPhoneWebhookEventProcessed).toHaveBeenCalledWith(1, lease)
  })

  it('does not mistake a failed completion of an existing signup for new onboarding', async () => {
    vi.mocked(findSmsSubscriberByPhoneNumber).mockResolvedValue({
      confirmedAt: new Date(),
    } as NonNullable<
      Awaited<ReturnType<typeof findSmsSubscriberByPhoneNumber>>
    >)
    vi.mocked(findOrCreatePhoneWebhookEvent).mockResolvedValue({
      ...webhook(false),
      event: { ...webhook(false).event, eventType: 'voice-menu-existing' },
    })
    expect(await subscribeVoiceCaller(input)).toBe('already_subscribed')
    expect(start).not.toHaveBeenCalled()
  })

  it('does not recreate a STOP-deleted subscriber when a processed call retries', async () => {
    vi.mocked(findOrCreatePhoneWebhookEvent).mockResolvedValue(
      webhook(false, new Date())
    )
    expect(await subscribeVoiceCaller(input)).toBe('already_handled')
    expect(subscribeSmsNumber).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })

  it('does not enroll a caller while speech or keypad owns the signup lease', async () => {
    vi.mocked(claimPhoneWebhookEvent).mockResolvedValue(null)
    expect(await subscribeVoiceCaller(input)).toBe('already_handled')
    expect(subscribeSmsNumber).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })

  it('can resume a subscriber saved before a workflow enqueue failure', async () => {
    vi.mocked(start).mockRejectedValueOnce(new Error('enqueue unavailable'))
    await expect(subscribeVoiceCaller(input)).rejects.toThrow(
      'enqueue unavailable'
    )
    expect(releasePhoneWebhookEvent).toHaveBeenCalledWith(1, lease)
    vi.mocked(findOrCreatePhoneWebhookEvent).mockResolvedValue(webhook(false))
    vi.mocked(findSmsSubscriberByPhoneNumber).mockResolvedValue({
      confirmedAt: new Date(),
    } as NonNullable<
      Awaited<ReturnType<typeof findSmsSubscriberByPhoneNumber>>
    >)
    await subscribeVoiceCaller(input)
    expect(start).toHaveBeenCalledTimes(2)
    expect(markPhoneWebhookEventProcessed).toHaveBeenCalledTimes(1)
  })

  it('fences an accepted enqueue when its completion acknowledgement fails', async () => {
    vi.mocked(markPhoneWebhookEventProcessed).mockRejectedValueOnce(
      new Error('database unavailable')
    )
    await expect(subscribeVoiceCaller(input)).rejects.toThrow(
      'database unavailable'
    )
    expect(start).toHaveBeenCalledTimes(1)
    expect(releasePhoneWebhookEvent).not.toHaveBeenCalled()
    expect(markPhoneWebhookEventSideEffectObserved).toHaveBeenCalledWith(
      1,
      'voice-signup:1'
    )
  })

  it.each([
    { from: 'anonymous' },
    { to: '+15551112222' },
  ])('rejects an unavailable caller or line: %j', async (override) => {
    expect(await subscribeVoiceCaller({ ...input, ...override })).toBe(
      'unavailable'
    )
    expect(findOrCreatePhoneWebhookEvent).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })
  it('cancels a stale consent turn before creating a signup event', async () => {
    let current = true
    vi.mocked(findSmsSubscriberByPhoneNumber).mockImplementationOnce(
      async () => {
        current = false
        return null
      }
    )
    expect(
      await subscribeVoiceCaller({ ...input, isCurrent: () => current })
    ).toBe('cancelled')
    expect(findOrCreatePhoneWebhookEvent).not.toHaveBeenCalled()
    expect(subscribeSmsNumber).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })

  it('releases the signup lease when the caller interrupts while it is being claimed', async () => {
    let current = true
    vi.mocked(claimPhoneWebhookEvent).mockImplementationOnce(async () => {
      current = false
      return lease
    })
    expect(
      await subscribeVoiceCaller({ ...input, isCurrent: () => current })
    ).toBe('cancelled')
    expect(releasePhoneWebhookEvent).toHaveBeenCalledWith(1, lease)
    expect(subscribeSmsNumber).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })

  it('finishes onboarding and its fence once the signup mutation was submitted', async () => {
    let current = true
    vi.mocked(subscribeSmsNumber).mockImplementationOnce(async () => {
      current = false
      return {} as Awaited<ReturnType<typeof subscribeSmsNumber>>
    })
    expect(
      await subscribeVoiceCaller({ ...input, isCurrent: () => current })
    ).toBe('subscribed')
    expect(start).toHaveBeenCalledTimes(1)
    expect(markPhoneWebhookEventProcessed).toHaveBeenCalledWith(1, lease)
    expect(sendSmsSignupNotification).toHaveBeenCalledTimes(1)
    expect(releasePhoneWebhookEvent).not.toHaveBeenCalled()
  })
  it('returns signup success while the background admin email is still pending', async () => {
    let finishNotification: () => void = () => undefined
    vi.mocked(sendSmsSignupNotification).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishNotification = resolve
      })
    )
    try {
      expect(await subscribeVoiceCaller(input)).toBe('subscribed')
      expect(afterTasks).toHaveLength(1)
      expect(markPhoneWebhookEventProcessed).toHaveBeenCalledWith(1, lease)
      expect(sendSmsSignupNotification).toHaveBeenCalledTimes(1)
    } finally {
      finishNotification()
    }
  })
})
