import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST } from '@/app/api/phone/keypad/route'
import {
  PHONE_IVR_FALLBACK_PROMPTS,
  verifyPhoneIvrAudioToken,
} from '@/lib/phone/ivr-audio'
import { twilioPostRequest } from '@/test/twilio'

const AUTH_TOKEN = 'test-twilio-auth-token'

function request(
  form: Record<string, string> = {},
  options: { signature?: string } = {}
): Request {
  return twilioPostRequest(
    'https://philipithomas.com/api/phone/keypad',
    form,
    AUTH_TOKEN,
    options
  )
}

function playedTexts(xml: string): string[] {
  return Array.from(xml.matchAll(/<Play>([^<]+)<\/Play>/g), ([, rawUrl]) => {
    const token = new URL(rawUrl.replaceAll('&amp;', '&')).searchParams.get(
      'token'
    )
    return verifyPhoneIvrAudioToken(token)?.text ?? ''
  })
}

beforeEach(() => {
  process.env.PHONE_NUMBER = '+12123473190'
  process.env.TWILIO_SECRET = AUTH_TOKEN
  process.env.OPENAI_API_KEY = 'test-openai-key'
  process.env.OPENAI_PROJECT_ID = 'proj_test123'
  process.env.OPENAI_WEBHOOK_SECRET = 'whsec_test'
})

afterEach(() => {
  delete process.env.PHONE_NUMBER
  delete process.env.TWILIO_SECRET
  delete process.env.OPENAI_API_KEY
  delete process.env.OPENAI_PROJECT_ID
  delete process.env.OPENAI_WEBHOOK_SECRET
})

describe('POST /api/phone/keypad', () => {
  it('requires a valid Twilio signature', async () => {
    const response = await POST(request({}, { signature: 'invalid' }))
    expect(response.status).toBe(401)
  })

  it('opens all three choices and retains caller metadata for voicemail', async () => {
    const response = await POST(
      request({
        From: '+15551234567',
        To: '+12123473190',
        CallSid: 'CA123',
        CallerName: 'Jane Caller',
      })
    )
    const xml = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(playedTexts(xml)).toEqual([
      PHONE_IVR_FALLBACK_PROMPTS.menuWithBell,
      PHONE_IVR_FALLBACK_PROMPTS.voicemail,
    ])
    expect(xml).toContain('input="dtmf" numDigits="1" timeout="6"')
    expect(xml).toContain('/api/phone/voice-menu')
    expect(xml).toContain('caller=%2B15551234567')
    expect(xml).toContain('CallSid=CA123')
    expect(xml).toContain('CallerName=Jane+Caller')
    expect(xml).not.toContain('<Hangup')
    expect(xml.indexOf('</Gather>')).toBeLessThan(xml.indexOf('<Record'))
  })

  it('omits SMS signup when its phone number is unavailable', async () => {
    delete process.env.PHONE_NUMBER
    const xml = await (await POST(request())).text()

    expect(playedTexts(xml)).toEqual([
      PHONE_IVR_FALLBACK_PROMPTS.bellMenu,
      PHONE_IVR_FALLBACK_PROMPTS.voicemail,
    ])
  })

  it('retains manual SMS signup when Bell is unavailable', async () => {
    delete process.env.OPENAI_API_KEY
    const xml = await (await POST(request())).text()

    expect(playedTexts(xml)).toEqual([
      PHONE_IVR_FALLBACK_PROMPTS.menu,
      PHONE_IVR_FALLBACK_PROMPTS.voicemail,
    ])
  })

  it('records voicemail if neither Bell nor SMS signup is available', async () => {
    delete process.env.PHONE_NUMBER
    delete process.env.OPENAI_API_KEY
    const xml = await (await POST(request())).text()

    expect(playedTexts(xml)).toEqual([PHONE_IVR_FALLBACK_PROMPTS.voicemail])
    expect(xml).not.toContain('<Gather')
    expect(xml).toContain('<Record')
  })
})
