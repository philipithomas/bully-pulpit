import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/phone/voicemail/route'
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
