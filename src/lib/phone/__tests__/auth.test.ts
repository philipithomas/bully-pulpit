import { afterEach, describe, expect, it } from 'vitest'
import { isAuthorizedPhoneWebhook } from '@/lib/phone/auth'

function requestWithSecret(secret?: string): Request {
  const url = new URL('https://philipithomas.com/api/phone/voice')
  if (secret !== undefined) url.searchParams.set('secret', secret)
  return new Request(url, { method: 'POST' })
}

describe('isAuthorizedPhoneWebhook', () => {
  afterEach(() => {
    delete process.env.TWILIO_SECRET
  })

  it('accepts the configured secret', () => {
    process.env.TWILIO_SECRET = 'correct-horse'
    expect(isAuthorizedPhoneWebhook(requestWithSecret('correct-horse'))).toBe(
      true
    )
  })

  it('rejects a wrong secret', () => {
    process.env.TWILIO_SECRET = 'correct-horse'
    expect(isAuthorizedPhoneWebhook(requestWithSecret('battery-staple'))).toBe(
      false
    )
  })

  it('rejects a missing secret parameter', () => {
    process.env.TWILIO_SECRET = 'correct-horse'
    expect(isAuthorizedPhoneWebhook(requestWithSecret())).toBe(false)
  })

  it('fails closed when the env var is unset', () => {
    delete process.env.TWILIO_SECRET
    expect(isAuthorizedPhoneWebhook(requestWithSecret('anything'))).toBe(false)
  })

  it('fails closed when the env var is empty', () => {
    process.env.TWILIO_SECRET = ''
    expect(isAuthorizedPhoneWebhook(requestWithSecret(''))).toBe(false)
  })
})
