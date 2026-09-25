import { describe, expect, it } from 'vitest'
import { BROWSER_SECURITY_HEADERS } from '@/lib/security/headers'

const headers = new Map(
  BROWSER_SECURITY_HEADERS.map(({ key, value }) => [key.toLowerCase(), value])
)

describe('security headers', () => {
  it('does not define the same response header twice', () => {
    expect(headers.size).toBe(BROWSER_SECURITY_HEADERS.length)
  })

  it('isolates top-level browsing contexts without breaking OAuth popups', () => {
    expect(headers.get('cross-origin-opener-policy')).toBe(
      'same-origin-allow-popups'
    )
  })

  it('retains the restrictive content, framing, referrer, and feature policies', () => {
    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('x-frame-options')).toBe('DENY')
    expect(headers.get('x-permitted-cross-domain-policies')).toBe('none')
    expect(headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin'
    )
    expect(headers.get('permissions-policy')).toBe(
      'camera=(), microphone=(), geolocation=(), browsing-topics=()'
    )
  })
})
