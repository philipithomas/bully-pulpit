import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: vi.fn() }
})
vi.mock('@/lib/db/queries/sms-subscribers', () => ({
  findSmsSubscriberByPhoneNumber: vi.fn(async () => null),
}))
vi.mock('@/lib/phone/greeting', () => ({
  generateGreeting: vi.fn(async () => 'Hello.'),
}))
vi.mock('@/lib/phone/voice-subscription', () => ({
  subscribeVoiceCaller: vi.fn(async () => 'subscribed'),
}))

import { POST as bellCompletePost } from '@/app/api/phone/bell-complete/route'
import { POST as voicePost } from '@/app/api/phone/voice/route'
import { POST as voiceMenuPost } from '@/app/api/phone/voice-menu/route'
import { findSmsSubscriberByPhoneNumber } from '@/lib/db/queries/sms-subscribers'
import { verifiedBellLiveSipMetadata } from '@/lib/phone/bell-live'
import {
  PHONE_IVR_FALLBACK_PROMPTS,
  verifyPhoneIvrAudioToken,
} from '@/lib/phone/ivr-audio'
import { subscribeVoiceCaller } from '@/lib/phone/voice-subscription'
import { phoneHandoffCallbackUrl } from '@/lib/phone/webhook-metadata'
import { twilioPostRequest } from '@/test/twilio'

const SECRET = 'test-twilio-secret'
const CALL = {
  From: '+14155551234',
  To: '+12123473190',
  CallSid: 'CA1234567890abcdef1234567890abcdef',
}
const ORIGINAL = {
  CallerName: 'Jane Caller',
  FromCity: 'San Francisco',
  FromState: 'CA',
  FromZip: '94105',
  FromCountry: 'US',
}

function request(url: string, form: Record<string, string>) {
  return twilioPostRequest(url, form, SECRET)
}

function actionUrl(xml: string, verb: 'Dial' | 'Gather'): string {
  return (
    xml
      .match(new RegExp(`<${verb} action="([^"]+)"`))?.[1]
      .replaceAll('&amp;', '&') ?? ''
  )
}

function sipMetadata(xml: string) {
  const uri =
    xml.match(/<Sip>([^<]+)<\/Sip>/)?.[1].replaceAll('&amp;', '&') ?? ''
  const headers = Array.from(
    new URLSearchParams(uri.slice(uri.indexOf('?') + 1)),
    ([name, value]) => ({ name, value })
  )
  return verifiedBellLiveSipMetadata(headers)
}

async function enterKeypad() {
  const voice = await voicePost(
    request('https://www.philipithomas.com/api/phone/voice', {
      ...CALL,
      ...ORIGINAL,
    })
  )
  const voiceXml = await voice.text()
  const keypad = await bellCompletePost(
    request(actionUrl(voiceXml, 'Dial'), {
      ...CALL,
      DialCallStatus: 'completed',
    })
  )
  return { voiceXml, keypadXml: await keypad.text() }
}

beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
  vi.stubEnv('OPENAI_PROJECT_ID', 'proj_test123')
  vi.stubEnv('OPENAI_WEBHOOK_SECRET', 'whsec_test-webhook-secret')
  vi.stubEnv('PHONE_NUMBER', CALL.To)
  vi.stubEnv('TWILIO_SECRET', SECRET)
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('signed caller metadata across Bell and keypad', () => {
  it('refreshes membership on each keypad entry around a Bell reconnection', async () => {
    vi.mocked(findSmsSubscriberByPhoneNumber)
      .mockResolvedValueOnce({
        confirmedAt: new Date(),
      } as NonNullable<
        Awaited<ReturnType<typeof findSmsSubscriberByPhoneNumber>>
      >)
      .mockResolvedValueOnce(null)

    const { keypadXml } = await enterKeypad()
    const firstMenuAudio = keypadXml.match(/<Play>([^<]+)<\/Play>/)?.[1]
    const firstMenuToken = new URL(
      (firstMenuAudio ?? '').replaceAll('&amp;', '&')
    ).searchParams.get('token')
    expect(verifyPhoneIvrAudioToken(firstMenuToken)?.text).toBe(
      PHONE_IVR_FALLBACK_PROMPTS.bellMenu
    )

    const reconnected = await voiceMenuPost(
      request(actionUrl(keypadXml, 'Gather'), { ...CALL, Digits: '3' })
    )
    const reconnectedXml = await reconnected.text()
    const returned = await bellCompletePost(
      request(actionUrl(reconnectedXml, 'Dial'), {
        ...CALL,
        DialCallStatus: 'completed',
      })
    )
    const returnedXml = await returned.text()
    const secondMenuAudio = returnedXml.match(/<Play>([^<]+)<\/Play>/)?.[1]
    const secondMenuToken = new URL(
      (secondMenuAudio ?? '').replaceAll('&amp;', '&')
    ).searchParams.get('token')
    expect(verifyPhoneIvrAudioToken(secondMenuToken)?.text).toBe(
      PHONE_IVR_FALLBACK_PROMPTS.menuWithBell
    )
    expect(findSmsSubscriberByPhoneNumber).toHaveBeenCalledTimes(2)
    expect(sipMetadata(reconnectedXml)).toMatchObject({
      callerName: ORIGINAL.CallerName,
      fromCity: ORIGINAL.FromCity,
    })
  })

  it('preserves the initial metadata across star and a new Bell SIP leg', async () => {
    const { voiceXml, keypadXml } = await enterKeypad()
    const reconnected = await voiceMenuPost(
      request(actionUrl(keypadXml, 'Gather'), { ...CALL, Digits: '3' })
    )
    const expected = {
      callSid: CALL.CallSid,
      callerName: ORIGINAL.CallerName,
      fromCity: ORIGINAL.FromCity,
      fromState: ORIGINAL.FromState,
      fromZip: ORIGINAL.FromZip,
      fromCountry: ORIGINAL.FromCountry,
      areaCode: '415',
      areaDescription: 'San Francisco, CA',
    }

    expect(sipMetadata(voiceXml)).toEqual(expected)
    expect(sipMetadata(await reconnected.text())).toEqual(expected)
    expect(keypadXml).toContain('CallerName=Jane+Caller')
    expect(keypadXml).toContain('FromCity=San+Francisco')
    expect(keypadXml).toContain('FromState=CA')
  })

  it('passes original metadata to keypad signup when later forms omit the hints', async () => {
    const { keypadXml } = await enterKeypad()
    const response = await voiceMenuPost(
      request(actionUrl(keypadXml, 'Gather'), { ...CALL, Digits: '2' })
    )

    expect(response.status).toBe(200)
    expect(subscribeVoiceCaller).toHaveBeenCalledWith({
      from: CALL.From,
      to: CALL.To,
      callSid: CALL.CallSid,
      metadata: expect.objectContaining({
        callerName: ORIGINAL.CallerName,
        fromCity: ORIGINAL.FromCity,
        fromState: ORIGINAL.FromState,
        areaCode: '415',
      }),
    })
  })

  it('prefers current signed Twilio hints over earlier callback hints', async () => {
    const { keypadXml } = await enterKeypad()
    await voiceMenuPost(
      request(actionUrl(keypadXml, 'Gather'), {
        ...CALL,
        Digits: '2',
        CallerName: 'Current Caller',
        FromCity: 'New York',
        FromState: 'NY',
      })
    )

    expect(subscribeVoiceCaller).toHaveBeenCalledWith(
      expect.objectContaining({
        from: CALL.From,
        to: CALL.To,
        metadata: expect.objectContaining({
          callerName: 'Current Caller',
          fromCity: 'New York',
          fromState: 'NY',
        }),
      })
    )
  })

  it('rejects query metadata that was added after Twilio signed its request', async () => {
    const originalUrl = 'https://www.philipithomas.com/api/phone/voice-menu'
    const signed = request(originalUrl, { ...CALL, Digits: '2' })
    const tamperedUrl = phoneHandoffCallbackUrl(originalUrl, {
      callerName: 'Injected Caller',
      fromCity: 'Injected City',
    })
    const tampered = new Request(tamperedUrl, {
      method: 'POST',
      headers: signed.headers,
      body: await signed.text(),
    })
    const response = await voiceMenuPost(tampered)

    expect(response.status).toBe(401)
    expect(subscribeVoiceCaller).not.toHaveBeenCalled()
  })
})
