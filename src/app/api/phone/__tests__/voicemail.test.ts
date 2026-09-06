import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/phone/voicemail/route'
import { phoneHandoffCallbackUrl } from '@/lib/phone/webhook-metadata'
import { twilioPostRequest } from '@/test/twilio'

const url = 'https://www.philipithomas.com/api/phone/voicemail'
const secret = 'test-webhook-secret'

beforeEach(() => {
  vi.stubEnv('TWILIO_SECRET', secret)
})
afterEach(() => {
  vi.unstubAllEnvs()
})

it('rejects unsigned voicemail handoffs', async () => {
  const response = await POST(
    new Request(url, {
      method: 'POST',
      body: new URLSearchParams({ From: '+14155551234' }),
    })
  )
  expect(response.status).toBe(401)
})

it('uses signed callback metadata and the existing voicemail recording instructions', async () => {
  const response = await POST(
    twilioPostRequest(
      url,
      {
        From: '+14155551234',
        To: '+12123473190',
        CallSid: 'CA123',
        CallerName: 'Jane',
        FromCity: 'San Francisco',
      },
      secret
    )
  )
  expect(response.status).toBe(200)
  const xml = await response.text()
  expect(xml).toContain('<Record')
  expect(xml).toContain('/api/phone/recording-complete')
  expect(xml).toContain(
    '/api/phone/recording-status?caller=%2B14155551234&amp;called=%2B12123473190'
  )
  expect(xml).toContain('CallSid=CA123')
  expect(xml).toContain('CallerName=Jane')
  expect(xml).toContain('FromCity=San+Francisco')
  expect(xml).not.toContain(secret)
})

it('preserves initial caller metadata from the authenticated live handoff URL', async () => {
  const callbackUrl = phoneHandoffCallbackUrl(url, {
    callerName: 'Jane Caller',
    fromCity: 'San Francisco',
    fromState: 'CA',
    fromCountry: 'US',
    callSid: 'CAwrong',
  })
  const response = await POST(
    twilioPostRequest(
      callbackUrl,
      {
        From: '+14155551234',
        To: '+12123473190',
        CallSid: 'CA123',
      },
      secret
    )
  )
  expect(response.status).toBe(200)
  const xml = await response.text()
  expect(xml).toContain('CallerName=Jane+Caller')
  expect(xml).toContain('FromCity=San+Francisco')
  expect(xml).toContain('FromState=CA')
  expect(xml).toContain('FromCountry=US')
  expect(xml).toContain('CallSid=CA123')
  expect(xml).not.toContain('CAwrong')
})

it('rejects tampering with metadata after the callback signature was made', async () => {
  const form = { From: '+14155551234', To: '+12123473190', CallSid: 'CA123' }
  const signed = twilioPostRequest(url, form, secret)
  const tamperedUrl = phoneHandoffCallbackUrl(url, { callerName: 'Injected' })
  const response = await POST(
    new Request(tamperedUrl, {
      method: 'POST',
      headers: signed.headers,
      body: new URLSearchParams(form),
    })
  )
  expect(response.status).toBe(401)
})
