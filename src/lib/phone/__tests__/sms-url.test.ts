import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeSmsSiteUrls, smsSiteOrigin } from '@/lib/phone/sms-url'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('SMS site URLs', () => {
  it('shortens the production origin', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('VERCEL_BRANCH_URL', '')

    expect(smsSiteOrigin()).toBe('https://philipithomas.com')
  })

  it('preserves preview and development origins', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_BRANCH_URL', 'sms-cleanup.vercel.app')
    expect(smsSiteOrigin()).toBe('https://sms-cleanup.vercel.app')

    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('VERCEL_ENV', 'development')
    expect(smsSiteOrigin()).toBe('http://localhost:3000')
  })

  it('shortens exact first-party links but leaves lookalike hosts alone', () => {
    expect(
      normalizeSmsSiteUrls(
        'https://www.philipithomas.com, https://www.philipithomas.com/contact, https://www.philipithomas.com.evil.test'
      )
    ).toBe(
      'https://philipithomas.com, https://philipithomas.com/contact, https://www.philipithomas.com.evil.test'
    )
  })
})
