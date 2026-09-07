import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/phone/twilio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/phone/twilio')>()),
  getCall: vi.fn(),
}))
vi.mock('@/lib/phone/caller-subscription', () => ({
  callerSubscriptionStatus: vi.fn(),
}))

import {
  bellLiveCallerSubscriptionStatus,
  verifiedBellLiveCaller,
} from '@/lib/phone/bell-live-caller'
import { callerSubscriptionStatus } from '@/lib/phone/caller-subscription'
import { getCall, type TwilioCall } from '@/lib/phone/twilio'

const callSid = 'CA1234567890abcdef1234567890abcdef'
const call: TwilioCall = {
  sid: callSid,
  from: '+14155551234',
  to: '+12123473190',
  status: 'in-progress',
  direction: 'inbound',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('PHONE_NUMBER', call.to)
  vi.mocked(getCall).mockResolvedValue(call)
  vi.mocked(callerSubscriptionStatus).mockResolvedValue('subscribed')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('authenticated Bell Live caller subscription lookup', () => {
  it('recognizes membership before answerOnBridge accepts the ringing SIP leg, while keeping actions unavailable', async () => {
    vi.mocked(getCall).mockResolvedValue({ ...call, status: 'ringing' })
    expect(await bellLiveCallerSubscriptionStatus(callSid)).toBe('subscribed')
    expect(callerSubscriptionStatus).toHaveBeenCalledExactlyOnceWith(call.from)
    expect(await verifiedBellLiveCaller(callSid)).toBeNull()
  })

  it.each([
    'subscribed',
    'not_subscribed',
    'unknown',
  ] as const)('returns %s only for the verified inbound caller number', async (status) => {
    vi.mocked(callerSubscriptionStatus).mockResolvedValue(status)
    expect(await bellLiveCallerSubscriptionStatus(callSid)).toBe(status)
    expect(getCall).toHaveBeenCalledExactlyOnceWith(callSid)
    expect(callerSubscriptionStatus).toHaveBeenCalledExactlyOnceWith(call.from)
  })

  it.each([
    { from: 'anonymous' },
    { to: '+15551112222' },
    { status: 'completed' },
    { direction: 'outbound-api' },
    { sid: 'CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  ])('does not look up subscriptions for an invalid caller: %j', async (override) => {
    vi.mocked(getCall).mockResolvedValue({ ...call, ...override })
    expect(await bellLiveCallerSubscriptionStatus(callSid)).toBe('unknown')
    expect(callerSubscriptionStatus).not.toHaveBeenCalled()
  })

  it('rejects malformed call identifiers before contacting Twilio', async () => {
    expect(await verifiedBellLiveCaller('../call')).toBeNull()
    expect(await bellLiveCallerSubscriptionStatus('../call')).toBe('unknown')
    expect(getCall).not.toHaveBeenCalled()
    expect(callerSubscriptionStatus).not.toHaveBeenCalled()
  })

  it.each([
    '',
    'invalid',
  ])('requires a configured valid phone number: %s', async (phoneNumber) => {
    vi.stubEnv('PHONE_NUMBER', phoneNumber)
    expect(await bellLiveCallerSubscriptionStatus(callSid)).toBe('unknown')
    expect(getCall).not.toHaveBeenCalled()
    expect(callerSubscriptionStatus).not.toHaveBeenCalled()
  })

  it('returns unknown on Twilio failure without logging provider details', async () => {
    vi.mocked(getCall).mockRejectedValue(
      new Error(`Provider error ${call.from}`)
    )
    expect(await bellLiveCallerSubscriptionStatus(callSid)).toBe('unknown')
    expect(callerSubscriptionStatus).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      '[phone/bell-live-caller] Caller lookup unavailable'
    )
  })

  it('returns unknown on an unexpected subscription failure', async () => {
    vi.mocked(callerSubscriptionStatus).mockRejectedValue(
      new Error(`Database error ${call.from}`)
    )
    expect(await bellLiveCallerSubscriptionStatus(callSid)).toBe('unknown')
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      '[phone/bell-live-caller] Caller lookup unavailable'
    )
  })

  it('limits the total Twilio and subscription lookup time to two seconds', async () => {
    vi.useFakeTimers()
    vi.mocked(getCall).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(call), 1_500))
    )
    vi.mocked(callerSubscriptionStatus).mockImplementationOnce(
      () => new Promise(() => {})
    )
    const result = bellLiveCallerSubscriptionStatus(callSid)
    await vi.advanceTimersByTimeAsync(1_500)
    expect(callerSubscriptionStatus).toHaveBeenCalledExactlyOnceWith(call.from)
    await vi.advanceTimersByTimeAsync(500)
    expect(await result).toBe('unknown')
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      '[phone/bell-live-caller] Caller lookup timed out'
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not begin a subscription lookup when Twilio responds after the deadline', async () => {
    vi.useFakeTimers()
    let resolveCaller: (caller: TwilioCall) => void = () => {}
    vi.mocked(getCall).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCaller = resolve
        })
    )
    const result = bellLiveCallerSubscriptionStatus(callSid)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await result).toBe('unknown')
    resolveCaller(call)
    await vi.advanceTimersByTimeAsync(0)
    expect(callerSubscriptionStatus).not.toHaveBeenCalled()
  })

  it('clears the deadline after a successful lookup', async () => {
    vi.useFakeTimers()
    expect(await bellLiveCallerSubscriptionStatus(callSid)).toBe('subscribed')
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(console.warn).not.toHaveBeenCalled()
  })
})
