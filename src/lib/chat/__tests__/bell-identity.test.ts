import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canAppendToWebBellConversation,
  isClientConversationId,
  networkIdentityForRequest,
  smsIdentityHash,
  utcIdentityPeriod,
} from '@/lib/chat/bell-identity'

beforeEach(() => {
  vi.stubEnv('BELL_IDENTITY_SECRET', 'test-bell-identity-secret')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Bell pseudonymous identity', () => {
  it('accepts canonical UUIDs and rejects arbitrary client IDs', () => {
    expect(isClientConversationId('11111111-1111-4111-8111-111111111111')).toBe(
      true
    )
    expect(isClientConversationId('session-1')).toBe(false)
    expect(isClientConversationId(null)).toBe(false)
  })

  it('rejects a stale client UUID after subscriber ownership is established', () => {
    expect(canAppendToWebBellConversation(null, null)).toBe(true)
    expect(canAppendToWebBellConversation(null, 7)).toBe(true)
    expect(canAppendToWebBellConversation(7, 7)).toBe(true)
    expect(canAppendToWebBellConversation(7, null)).toBe(false)
    expect(canAppendToWebBellConversation(7, 8)).toBe(false)
  })

  it('uses the Vercel-forwarded IP and rotates the digest each UTC month', () => {
    const request = new Request('https://example.com/api/chat', {
      headers: {
        'x-vercel-forwarded-for': '203.0.113.8',
        'x-forwarded-for': '198.51.100.4',
        'user-agent': 'this is deliberately irrelevant',
      },
    })
    const july = networkIdentityForRequest(
      request,
      new Date('2026-07-31T23:59:00.000Z')
    )
    const julyAgain = networkIdentityForRequest(
      new Request('https://example.com/api/chat', {
        headers: { 'x-vercel-forwarded-for': '203.0.113.8' },
      }),
      new Date('2026-07-01T00:00:00.000Z')
    )
    const august = networkIdentityForRequest(
      request,
      new Date('2026-08-01T00:00:00.000Z')
    )
    expect(july).toEqual(julyAgain)
    expect(july?.period).toBe('2026-07')
    expect(august?.period).toBe('2026-08')
    expect(august?.hash).not.toBe(july?.hash)
    expect(july?.hash).not.toContain('203.0.113.8')
  })

  it('omits network identity when no usable IP exists', () => {
    expect(
      networkIdentityForRequest(new Request('https://example.com/api/chat'))
    ).toBeNull()
    expect(utcIdentityPeriod(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01')
  })

  it('creates a stable keyed SMS lookup without exposing the number', () => {
    const first = smsIdentityHash('+15551234567')
    expect(first).toBe(smsIdentityHash('+15551234567'))
    expect(first).not.toContain('+15551234567')
  })

  it('requires the dedicated identity key in production', () => {
    vi.stubEnv('BELL_IDENTITY_SECRET', '')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(() => smsIdentityHash('+15551234567')).toThrow(
      'BELL_IDENTITY_SECRET is required in production'
    )
  })
})
