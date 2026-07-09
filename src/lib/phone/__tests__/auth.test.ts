import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validatedPhoneWebhookForm } from '@/lib/phone/auth'
import { twilioPostRequest } from '@/test/twilio'

const AUTH_TOKEN = 'test-twilio-auth-token'
const VOICE_URL = 'https://philipithomas.com/api/phone/voice'
const ORIGINAL_VERCEL = process.env.VERCEL

describe('validatedPhoneWebhookForm', () => {
  beforeEach(() => {
    process.env.TWILIO_SECRET = AUTH_TOKEN
    delete process.env.VERCEL
  })

  afterEach(() => {
    delete process.env.TWILIO_SECRET
    if (ORIGINAL_VERCEL === undefined) {
      delete process.env.VERCEL
    } else {
      process.env.VERCEL = ORIGINAL_VERCEL
    }
  })

  it("accepts Twilio's published signature vector", async () => {
    process.env.TWILIO_SECRET = '12345'
    const request = twilioPostRequest(
      'https://example.com/myapp.php?foo=1&bar=2',
      {
        CallSid: 'CA1234567890ABCDE',
        Caller: '+14158675310',
        Digits: '1234',
        From: '+14158675310',
        To: '+18005551212',
      },
      '12345',
      { signature: 'L/OH5YylLD5NRKLltdqwSvS0BnU=' }
    )

    const form = await validatedPhoneWebhookForm(request)
    expect(form?.get('Digits')).toBe('1234')
    expect(form?.get('CallSid')).toBe('CA1234567890ABCDE')
  })

  it('rejects an invalid signature', async () => {
    const request = twilioPostRequest(
      VOICE_URL,
      { From: '+15551234567', To: '+12123473190' },
      AUTH_TOKEN,
      { signature: 'invalid-signature' }
    )

    await expect(validatedPhoneWebhookForm(request)).resolves.toBeNull()
  })

  it('rejects a missing signature', async () => {
    const request = new Request(VOICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        From: '+15551234567',
        To: '+12123473190',
      }),
    })

    await expect(validatedPhoneWebhookForm(request)).resolves.toBeNull()
  })

  it('rejects a body changed after it was signed', async () => {
    const signed = twilioPostRequest(
      VOICE_URL,
      { From: '+15551234567', To: '+12123473190', Digits: '1' },
      AUTH_TOKEN
    )
    const request = twilioPostRequest(
      VOICE_URL,
      { From: '+15551234567', To: '+12123473190', Digits: '2' },
      AUTH_TOKEN,
      { signature: signed.headers.get('x-twilio-signature') ?? '' }
    )

    await expect(validatedPhoneWebhookForm(request)).resolves.toBeNull()
  })

  it('rejects a signature created for a different query string', async () => {
    const requestUrl = `${VOICE_URL}?caller=%2B15551234567`
    const request = twilioPostRequest(
      requestUrl,
      { CallSid: 'CA123' },
      AUTH_TOKEN,
      { signatureUrl: `${VOICE_URL}?caller=%2B19999999999` }
    )

    await expect(validatedPhoneWebhookForm(request)).resolves.toBeNull()
  })

  it('fails closed when the auth token is unset', async () => {
    delete process.env.TWILIO_SECRET
    const request = twilioPostRequest(
      VOICE_URL,
      { From: '+15551234567', To: '+12123473190' },
      AUTH_TOKEN
    )

    await expect(validatedPhoneWebhookForm(request)).resolves.toBeNull()
  })

  it('preserves and validates duplicate form parameters', async () => {
    const request = twilioPostRequest(
      VOICE_URL,
      {
        From: '+15551234567',
        To: '+12123473190',
        MediaUrl: ['https://example.com/one', 'https://example.com/two'],
      },
      AUTH_TOKEN
    )

    const form = await validatedPhoneWebhookForm(request)
    expect(form?.getAll('MediaUrl')).toEqual([
      'https://example.com/one',
      'https://example.com/two',
    ])
  })

  it('reconstructs the public Vercel URL before validating', async () => {
    process.env.VERCEL = '1'
    const publicUrl =
      'https://www.philipithomas.com/api/phone/recording-status?caller=%2B15551234567&called=%2B12123473190'
    const internalUrl =
      'http://127.0.0.1:3000/api/phone/recording-status?caller=%2B15551234567&called=%2B12123473190'
    const request = twilioPostRequest(
      internalUrl,
      { RecordingStatus: 'completed', RecordingSid: 'RE123' },
      AUTH_TOKEN,
      {
        signatureUrl: publicUrl,
        headers: {
          'x-forwarded-host': 'www.philipithomas.com',
          'x-forwarded-proto': 'https',
        },
      }
    )

    const form = await validatedPhoneWebhookForm(request)
    expect(form?.get('RecordingSid')).toBe('RE123')
  })
})
