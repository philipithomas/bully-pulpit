import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/queries/phone-webhook-events', () => ({
  claimPhoneWebhookEvent: vi.fn(),
  findOrCreatePhoneWebhookEvent: vi.fn(),
  markPhoneWebhookEventSideEffectObserved: vi.fn(),
  releasePhoneWebhookEvent: vi.fn(),
}))
vi.mock('@/lib/phone/twilio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/phone/twilio')>()),
  getCall: vi.fn(),
  redirectCallToVoicemail: vi.fn(),
}))
vi.mock('@/lib/phone/voice-subscription', () => ({
  subscribeVoiceCaller: vi.fn(),
}))

import {
  claimPhoneWebhookEvent,
  findOrCreatePhoneWebhookEvent,
  markPhoneWebhookEventSideEffectObserved,
  releasePhoneWebhookEvent,
} from '@/lib/db/queries/phone-webhook-events'
import {
  BELL_VOICE_SUBSCRIPTION_DISCLOSURE,
  createBellLiveActionHandler,
} from '@/lib/phone/bell-live-actions'
import {
  getCall,
  redirectCallToVoicemail,
  TwilioApiError,
} from '@/lib/phone/twilio'
import { subscribeVoiceCaller } from '@/lib/phone/voice-subscription'

const callSid = 'CA1234567890abcdef1234567890abcdef'
const call = {
  sid: callSid,
  from: '+14155551234',
  to: '+12123473190',
  status: 'in-progress',
  direction: 'inbound',
}
const lease = new Date()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PHONE_NUMBER', call.to)
  vi.mocked(getCall).mockResolvedValue(call)
  vi.mocked(redirectCallToVoicemail).mockResolvedValue()
  vi.mocked(claimPhoneWebhookEvent).mockResolvedValue(lease)
  vi.mocked(findOrCreatePhoneWebhookEvent).mockResolvedValue({
    inserted: true,
    event: { id: 1, processedAt: null },
  } as Awaited<ReturnType<typeof findOrCreatePhoneWebhookEvent>>)
  vi.mocked(markPhoneWebhookEventSideEffectObserved).mockResolvedValue(true)
  vi.mocked(subscribeVoiceCaller).mockResolvedValue('subscribed')
})
afterEach(() => vi.unstubAllEnvs())

describe('private Bell Live actions', () => {
  it.each([
    ['other', {}],
    ['start_voicemail', { phone: call.from }],
    ['start_voicemail', []],
    ['subscribe_caller', {}],
    ['subscribe_caller', { confirmed: 'true' }],
    ['subscribe_caller', { confirmed: true, phone: call.from }],
  ])('rejects malformed or unknown %s actions without side effects', async (name, args) => {
    const actions = createBellLiveActionHandler(callSid)
    expect(await actions.execute(String(name), args, 1)).toMatchObject({
      status: 'unavailable',
    })
    expect(getCall).not.toHaveBeenCalled()
    expect(subscribeVoiceCaller).not.toHaveBeenCalled()
    expect(redirectCallToVoicemail).not.toHaveBeenCalled()
  })

  it.each([
    { from: 'anonymous' },
    { to: '+15551112222' },
    { status: 'completed' },
    { direction: 'outbound-api' },
    { sid: 'CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  ])('rejects a call that is no longer the verified inbound caller: %j', async (override) => {
    vi.mocked(getCall).mockResolvedValue({ ...call, ...override })
    const actions = createBellLiveActionHandler(callSid)
    expect(await actions.execute('start_voicemail', {}, 1)).toMatchObject({
      status: 'unavailable',
    })
    expect(redirectCallToVoicemail).not.toHaveBeenCalled()
    expect(findOrCreatePhoneWebhookEvent).not.toHaveBeenCalled()
  })

  it('rejects an invalid bound CallSid without querying Twilio', async () => {
    expect(
      await createBellLiveActionHandler('../call').execute(
        'start_voicemail',
        {},
        1
      )
    ).toMatchObject({ status: 'unavailable' })
    expect(getCall).not.toHaveBeenCalled()
  })

  it('requires disclosure and a later caller turn before signup, and rechecks the call', async () => {
    const actions = createBellLiveActionHandler(callSid)
    expect(
      await actions.execute('subscribe_caller', { confirmed: true }, 1)
    ).toMatchObject({ status: 'confirmation_required' })
    expect(subscribeVoiceCaller).not.toHaveBeenCalled()
    expect(
      await actions.execute('subscribe_caller', { confirmed: false }, 1)
    ).toEqual({
      status: 'confirmation_required',
      message: BELL_VOICE_SUBSCRIPTION_DISCLOSURE,
      disclosure: BELL_VOICE_SUBSCRIPTION_DISCLOSURE,
    })
    expect(
      await actions.execute('subscribe_caller', { confirmed: true }, 1)
    ).toMatchObject({ status: 'confirmation_required' })
    expect(subscribeVoiceCaller).not.toHaveBeenCalled()
    expect(actions.markSubscriptionDisclosureDelivered(1)).toBe(true)
    const result = await actions.execute(
      'subscribe_caller',
      { confirmed: true },
      2
    )
    expect(result.status).toBe('subscribed')
    expect(JSON.stringify(result)).not.toContain(call.from)
    expect(getCall).toHaveBeenCalledTimes(2)
    expect(subscribeVoiceCaller).toHaveBeenCalledWith({
      from: call.from,
      to: call.to,
      callSid,
      metadata: { callSid },
      source: 'voice-bell',
      isCurrent: expect.any(Function),
    })
    await actions.execute('subscribe_caller', { confirmed: true }, 3)
    expect(subscribeVoiceCaller).toHaveBeenCalledTimes(1)
  })

  it('does not subscribe if the caller hangs up after hearing the disclosure', async () => {
    const actions = createBellLiveActionHandler(callSid)
    await actions.execute('subscribe_caller', { confirmed: false }, 1)
    expect(actions.markSubscriptionDisclosureDelivered(1)).toBe(true)
    vi.mocked(getCall).mockResolvedValue({ ...call, status: 'completed' })
    expect(
      await actions.execute('subscribe_caller', { confirmed: true }, 2)
    ).toMatchObject({ status: 'unavailable' })
    expect(subscribeVoiceCaller).not.toHaveBeenCalled()
  })

  it('marks handoff before redirecting and never repeats a successful redirect', async () => {
    const actions = createBellLiveActionHandler(callSid)
    vi.mocked(redirectCallToVoicemail).mockImplementation(async () => {
      expect(actions.hasHandedOff()).toBe(true)
    })
    expect(await actions.execute('start_voicemail', {}, 1)).toMatchObject({
      status: 'handed_off',
    })
    await actions.execute('start_voicemail', {}, 2)
    expect(redirectCallToVoicemail).toHaveBeenCalledExactlyOnceWith(callSid, {
      callSid,
    })
    expect(markPhoneWebhookEventSideEffectObserved).toHaveBeenCalledWith(
      1,
      `bell-live:${callSid}:voicemail`
    )
    expect(
      await actions.execute('subscribe_caller', { confirmed: false }, 3)
    ).toMatchObject({ status: 'unavailable' })
  })

  it('does not redirect again when another controller owns the action lease', async () => {
    vi.mocked(claimPhoneWebhookEvent).mockResolvedValue(null)
    const actions = createBellLiveActionHandler(callSid)
    expect(await actions.execute('start_voicemail', {}, 1)).toMatchObject({
      status: 'handoff_pending',
    })
    expect(actions.hasHandedOff()).toBe(true)
    expect(redirectCallToVoicemail).not.toHaveBeenCalled()
  })

  it('releases a definitively rejected redirect for a safe retry', async () => {
    vi.mocked(redirectCallToVoicemail).mockRejectedValueOnce(
      new TwilioApiError('rejected', 400)
    )
    const actions = createBellLiveActionHandler(callSid)
    expect(await actions.execute('start_voicemail', {}, 1)).toMatchObject({
      status: 'unavailable',
    })
    expect(actions.hasHandedOff()).toBe(false)
    expect(releasePhoneWebhookEvent).toHaveBeenCalledWith(1, lease)
    await actions.execute('start_voicemail', {}, 2)
    expect(actions.hasHandedOff()).toBe(true)
  })

  it.each([
    new TypeError('fetch failed'),
    new TwilioApiError('server error', 503),
  ])('does not retry an ambiguous redirect outcome', async (error) => {
    vi.mocked(redirectCallToVoicemail).mockRejectedValueOnce(error)
    const actions = createBellLiveActionHandler(callSid)
    expect(await actions.execute('start_voicemail', {}, 1)).toMatchObject({
      status: 'handoff_pending',
    })
    await actions.execute('start_voicemail', {}, 2)
    expect(actions.hasHandedOff()).toBe(true)
    expect(redirectCallToVoicemail).toHaveBeenCalledTimes(1)
    expect(releasePhoneWebhookEvent).not.toHaveBeenCalled()
  })
  it('cancels voicemail when a caller interrupts during Twilio lookup', async () => {
    let current = true
    vi.mocked(getCall).mockImplementationOnce(async () => {
      current = false
      return call
    })
    const actions = createBellLiveActionHandler(callSid)
    expect(
      await actions.execute('start_voicemail', {}, 1, () => current)
    ).toMatchObject({ status: 'cancelled' })
    expect(findOrCreatePhoneWebhookEvent).not.toHaveBeenCalled()
    expect(redirectCallToVoicemail).not.toHaveBeenCalled()
    expect(actions.hasHandedOff()).toBe(false)
  })

  it('releases a voicemail lease if the caller switches to keypad while the lease is loading', async () => {
    let current = true
    vi.mocked(claimPhoneWebhookEvent).mockImplementationOnce(async () => {
      current = false
      return lease
    })
    const actions = createBellLiveActionHandler(callSid)
    expect(
      await actions.execute('start_voicemail', {}, 1, () => current)
    ).toMatchObject({ status: 'cancelled' })
    expect(releasePhoneWebhookEvent).toHaveBeenCalledWith(1, lease)
    expect(redirectCallToVoicemail).not.toHaveBeenCalled()
    expect(actions.hasHandedOff()).toBe(false)
  })

  it('does not subscribe when the consent turn is superseded during caller verification', async () => {
    let current = true
    const actions = createBellLiveActionHandler(callSid)
    await actions.execute('subscribe_caller', { confirmed: false }, 1)
    expect(actions.markSubscriptionDisclosureDelivered(1)).toBe(true)
    vi.mocked(getCall).mockImplementationOnce(async () => {
      current = false
      return call
    })
    expect(
      await actions.execute(
        'subscribe_caller',
        { confirmed: true },
        2,
        () => current
      )
    ).toMatchObject({ status: 'cancelled' })
    expect(subscribeVoiceCaller).not.toHaveBeenCalled()
  })

  it('keeps fencing a submitted voicemail redirect after the control connection closes', async () => {
    let current = true
    const actions = createBellLiveActionHandler(callSid)
    vi.mocked(redirectCallToVoicemail).mockImplementationOnce(async () => {
      current = false
    })
    expect(
      await actions.execute('start_voicemail', {}, 1, () => current)
    ).toMatchObject({ status: 'handed_off' })
    expect(markPhoneWebhookEventSideEffectObserved).toHaveBeenCalledWith(
      1,
      `bell-live:${callSid}:voicemail`
    )
    expect(actions.hasHandedOff()).toBe(true)
  })
  it('does not authorize signup merely because the disclosure was generated', async () => {
    const actions = createBellLiveActionHandler(callSid)
    await actions.execute('subscribe_caller', { confirmed: false }, 1)
    expect(
      await actions.execute('subscribe_caller', { confirmed: true }, 2)
    ).toMatchObject({ status: 'confirmation_required' })
    expect(subscribeVoiceCaller).not.toHaveBeenCalled()
    expect(getCall).toHaveBeenCalledTimes(1)
  })

  it('rejects acknowledgements that do not match the prepared disclosure turn', async () => {
    const actions = createBellLiveActionHandler(callSid)
    expect(actions.markSubscriptionDisclosureDelivered(1)).toBe(false)
    await actions.execute('subscribe_caller', { confirmed: false }, 2)
    expect(actions.markSubscriptionDisclosureDelivered(1)).toBe(false)
    expect(
      await actions.execute('subscribe_caller', { confirmed: true }, 3)
    ).toMatchObject({ status: 'confirmation_required' })
    expect(subscribeVoiceCaller).not.toHaveBeenCalled()
  })

  it('invalidates interrupted playback so a late completion cannot arm consent', async () => {
    const actions = createBellLiveActionHandler(callSid)
    await actions.execute('subscribe_caller', { confirmed: false }, 1)
    actions.cancelSubscriptionDisclosure(1)
    expect(actions.markSubscriptionDisclosureDelivered(1)).toBe(false)
    expect(
      await actions.execute('subscribe_caller', { confirmed: true }, 2)
    ).toMatchObject({ status: 'confirmation_required' })
    expect(subscribeVoiceCaller).not.toHaveBeenCalled()
  })

  it('requires fresh playback after a repeated prepare even on the same caller turn', async () => {
    const actions = createBellLiveActionHandler(callSid)
    await actions.execute('subscribe_caller', { confirmed: false }, 1)
    expect(actions.markSubscriptionDisclosureDelivered(1)).toBe(true)
    await actions.execute('subscribe_caller', { confirmed: false }, 1)
    expect(
      await actions.execute('subscribe_caller', { confirmed: true }, 2)
    ).toMatchObject({ status: 'confirmation_required' })
    expect(subscribeVoiceCaller).not.toHaveBeenCalled()
    expect(actions.markSubscriptionDisclosureDelivered(1)).toBe(true)
    expect(
      await actions.execute('subscribe_caller', { confirmed: true }, 3)
    ).toMatchObject({ status: 'subscribed' })
  })

  it('clears armed consent when its confirmation turn is cancelled', async () => {
    const actions = createBellLiveActionHandler(callSid)
    await actions.execute('subscribe_caller', { confirmed: false }, 1)
    expect(actions.markSubscriptionDisclosureDelivered(1)).toBe(true)
    expect(
      await actions.execute(
        'subscribe_caller',
        { confirmed: true },
        2,
        () => false
      )
    ).toMatchObject({ status: 'cancelled' })
    expect(actions.markSubscriptionDisclosureDelivered(1)).toBe(false)
    expect(
      await actions.execute('subscribe_caller', { confirmed: true }, 3)
    ).toMatchObject({ status: 'confirmation_required' })
    expect(subscribeVoiceCaller).not.toHaveBeenCalled()
  })
  it('forwards authenticated provider metadata without letting it replace the bound CallSid', async () => {
    const actions = createBellLiveActionHandler(callSid, {
      callSid: 'CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      callerName: 'Jane Caller',
      fromCity: 'San Francisco',
      fromState: 'CA',
      fromCountry: 'US',
    })
    await actions.execute('subscribe_caller', { confirmed: false }, 1)
    expect(actions.markSubscriptionDisclosureDelivered(1)).toBe(true)
    expect(
      await actions.execute('subscribe_caller', { confirmed: true }, 2)
    ).toMatchObject({ status: 'subscribed' })
    expect(subscribeVoiceCaller).toHaveBeenCalledWith(
      expect.objectContaining({
        callSid,
        metadata: {
          callSid,
          callerName: 'Jane Caller',
          fromCity: 'San Francisco',
          fromState: 'CA',
          fromCountry: 'US',
        },
      })
    )
  })
  it('preserves trusted caller hints when handing off to voicemail', async () => {
    const actions = createBellLiveActionHandler(callSid, {
      callSid: 'CAwrong',
      callerName: 'Jane',
      fromCity: 'San Francisco',
    })
    expect(await actions.execute('start_voicemail', {}, 1)).toMatchObject({
      status: 'handed_off',
    })
    expect(redirectCallToVoicemail).toHaveBeenCalledWith(callSid, {
      callSid,
      callerName: 'Jane',
      fromCity: 'San Francisco',
    })
  })
})
