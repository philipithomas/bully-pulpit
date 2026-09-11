import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/queries/phone-webhook-events', () => ({
  findPhoneWebhookEventByKey: vi.fn(),
}))
vi.mock('@/lib/phone/bell-live', () => ({
  phoneBellLiveConfigured: vi.fn(),
  PHONE_BELL_MAX_CALL_SECONDS: 300,
}))
vi.mock('@/lib/phone/caller-subscription', () => ({
  callerSubscriptionStatus: vi.fn(),
}))

import { findPhoneWebhookEventByKey } from '@/lib/db/queries/phone-webhook-events'
import type { PhoneWebhookEvent } from '@/lib/db/schema'
import { phoneBellLiveConfigured } from '@/lib/phone/bell-live'
import { callerSubscriptionStatus } from '@/lib/phone/caller-subscription'
import { verifyPhoneIvrAudioToken } from '@/lib/phone/ivr-audio'
import { phoneKeypadTwiml } from '@/lib/phone/keypad'

const callSid = 'CA1234567890abcdef1234567890abcdef'

function callerForm(sid = callSid): FormData {
  const form = new FormData()
  form.set('From', '+14155551234')
  form.set('To', '+12123473190')
  form.set('CallSid', sid)
  return form
}

function pendingSignup(
  overrides: Partial<PhoneWebhookEvent> = {}
): PhoneWebhookEvent {
  return {
    id: 1,
    eventKey: `voice-menu:${callSid}:2`,
    eventType: 'voice-menu',
    attemptCount: 1,
    processingAt: null,
    processedAt: null,
    processedStepId: null,
    createdAt: new Date(),
    ...overrides,
  }
}

function spokenText(xml: string): string {
  return Array.from(xml.matchAll(/<Play>([^<]+)<\/Play>/g), ([, rawUrl]) => {
    const token = new URL(rawUrl.replaceAll('&amp;', '&')).searchParams.get(
      'token'
    )
    return verifyPhoneIvrAudioToken(token)?.text ?? ''
  }).join(' ')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PHONE_NUMBER', '+12123473190')
  vi.stubEnv('TWILIO_SECRET', 'test-twilio-secret')
  vi.mocked(phoneBellLiveConfigured).mockReturnValue(true)
  vi.mocked(callerSubscriptionStatus).mockResolvedValue('subscribed')
  vi.mocked(findPhoneWebhookEventByKey).mockResolvedValue(null)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('phone keypad signup recovery', () => {
  it('keeps ordinary subscribed callers out of the signup menu', async () => {
    const xml = await phoneKeypadTwiml(callerForm())
    expect(spokenText(xml)).toContain('Press 1 to leave a voicemail.')
    expect(spokenText(xml)).toContain('Press 3 to talk to Bell AI.')
    expect(spokenText(xml)).not.toContain('Press 2')
    expect(findPhoneWebhookEventByKey).toHaveBeenCalledExactlyOnceWith(
      `voice-menu:${callSid}:2`
    )
  })

  it.each([
    true,
    false,
  ])('restores the full disclosure and digit 2 for a partially saved same-call signup when Bell availability is %s', async (bellAvailable) => {
    vi.mocked(phoneBellLiveConfigured).mockReturnValue(bellAvailable)
    vi.mocked(findPhoneWebhookEventByKey).mockResolvedValue(pendingSignup())
    const xml = await phoneKeypadTwiml(callerForm())
    const text = spokenText(xml)
    expect(text).toContain('Press 2 to subscribe to recurring new-post texts')
    expect(text).toContain(
      'Frequency varies. Message and data rates may apply.'
    )
    expect(text).toContain('Text STOP to unsubscribe or HELP for help.')
    expect(xml).toContain('/api/phone/voice-menu')
    expect(xml).toContain('<Gather')
  })

  it.each([
    { processedAt: new Date() },
    { eventType: 'voice-menu-existing' },
    { eventType: 'bell-live-action' },
  ])('does not offer signup for a completed or unrelated event: %j', async (override) => {
    vi.mocked(findPhoneWebhookEventByKey).mockResolvedValue(
      pendingSignup(override)
    )
    expect(spokenText(await phoneKeypadTwiml(callerForm()))).not.toContain(
      'Press 2'
    )
  })

  it.each([
    'not_subscribed',
    'unknown',
  ] as const)('preserves normal signup for %s callers without a recovery lookup', async (status) => {
    vi.mocked(callerSubscriptionStatus).mockResolvedValue(status)
    expect(spokenText(await phoneKeypadTwiml(callerForm()))).toContain(
      'Press 2'
    )
    expect(findPhoneWebhookEventByKey).not.toHaveBeenCalled()
  })

  it('ignores malformed parent call identifiers during recovery lookup', async () => {
    expect(
      spokenText(await phoneKeypadTwiml(callerForm('../other')))
    ).not.toContain('Press 2')
    expect(findPhoneWebhookEventByKey).not.toHaveBeenCalled()
  })

  it('retains voicemail and Bell options when the recovery lookup is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(findPhoneWebhookEventByKey).mockRejectedValueOnce(
      new Error('database unavailable')
    )
    const text = spokenText(await phoneKeypadTwiml(callerForm()))
    expect(text).toContain('Press 1')
    expect(text).toContain('Press 3')
    expect(text).not.toContain('Press 2')
  })
})
