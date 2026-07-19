import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Subscriber } from '@/lib/db/schema'

const mocks = vi.hoisted(() => ({
  claimTidbitsOptInNotification: vi.fn(),
  sendExistingSubscriberOptInNotification: vi.fn(),
}))

vi.mock('@/lib/db/queries/subscribers', () => ({
  claimTidbitsOptInNotification: mocks.claimTidbitsOptInNotification,
  confirmSubscriber: vi.fn(),
  createSubscriber: vi.fn(),
  findByEmail: vi.fn(),
  updateSubscriber: vi.fn(),
}))

vi.mock('@/lib/email/send', () => ({
  sendExistingSubscriberOptInNotification:
    mocks.sendExistingSubscriberOptInNotification,
  sendNewSubscriberNotification: vi.fn(),
}))

import {
  normalizedNewsletters,
  notifyExistingSubscriberOptIns,
} from '@/lib/auth/subscriber-service'

const existingSubscriber = {
  id: 1,
  email: 'reader@example.com',
  name: 'Reader',
  confirmedAt: new Date('2026-07-16T00:00:00Z'),
  subscribedTidbits: false,
} as Subscriber

const optedInSubscriber = {
  ...existingSubscriber,
  subscribedTidbits: true,
} as Subscriber

describe('notifyExistingSubscriberOptIns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not fail verification when claiming the admin notification fails', async () => {
    const error = new Error('temporary database failure')
    mocks.claimTidbitsOptInNotification.mockRejectedValue(error)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      notifyExistingSubscriberOptIns(existingSubscriber, optedInSubscriber)
    ).resolves.toBeUndefined()

    expect(mocks.sendExistingSubscriberOptInNotification).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith(
      '[subscriber] Tidbits opt-in notification failed:',
      error
    )
    consoleError.mockRestore()
  })
})

describe('normalizedNewsletters', () => {
  it('carries legacy Umami signup consent forward to Tidbits', () => {
    expect(
      normalizedNewsletters(['umami', 'tidbits', 'not-a-newsletter'])
    ).toEqual(['tidbits'])
  })
})
