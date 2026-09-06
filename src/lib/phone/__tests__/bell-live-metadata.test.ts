import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bellLiveSipUri,
  verifiedBellLiveSipCallSid,
  verifiedBellLiveSipMetadata,
} from '@/lib/phone/bell-live'
import {
  decodePhoneHandoffMetadata,
  encodePhoneHandoffMetadata,
  type TwilioWebhookMetadata,
} from '@/lib/phone/webhook-metadata'

const NOW = new Date('2026-09-06T12:00:00Z')
const CALL_SID = 'CA1234567890abcdef1234567890abcdef'
const SECRET = 'test-twilio-secret'
const METADATA: TwilioWebhookMetadata = {
  callSid: CALL_SID,
  callerName: 'Jane Caller',
  fromCity: 'San Francisco',
  fromState: 'CA',
  fromZip: '94105',
  fromCountry: 'US',
  areaCode: '415',
  areaDescription: 'San Francisco, CA',
}

function headersFromSipUri(uri: string) {
  return Array.from(
    new URLSearchParams(uri.slice(uri.indexOf('?') + 1)),
    ([name, value]) => ({ name, value })
  )
}

beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
  vi.stubEnv('OPENAI_PROJECT_ID', 'proj_test123')
  vi.stubEnv('OPENAI_WEBHOOK_SECRET', 'whsec_test-webhook-secret')
  vi.stubEnv('TWILIO_SECRET', SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Bell SIP metadata handoff', () => {
  it('preserves the original bounded caller metadata under the call invitation', () => {
    const uri = bellLiveSipUri(CALL_SID, NOW, METADATA)
    const headers = headersFromSipUri(uri ?? '')

    expect(uri).not.toBeNull()
    expect(verifiedBellLiveSipCallSid(headers, NOW)).toBe(CALL_SID)
    expect(verifiedBellLiveSipMetadata(headers, NOW)).toEqual(METADATA)
    expect(uri?.split('?')[0].length).toBeLessThan(255)
    expect(uri?.split('?')[1].length).toBeLessThan(1024)
  })

  it('rejects metadata injection, tampering, removal, and duplicate headers', () => {
    const legacy = headersFromSipUri(bellLiveSipUri(CALL_SID, NOW) ?? '')
    const current = headersFromSipUri(
      bellLiveSipUri(CALL_SID, NOW, METADATA) ?? ''
    )
    const metadataHeader = current.find(
      (header) => header.name === 'x-bp-metadata'
    )!
    const tampered = current.map((header) =>
      header.name === metadataHeader.name
        ? {
            ...header,
            value: encodePhoneHandoffMetadata({
              callerName: 'Another Caller',
            })!,
          }
        : header
    )

    expect(
      verifiedBellLiveSipMetadata([...legacy, metadataHeader], NOW)
    ).toBeNull()
    expect(verifiedBellLiveSipMetadata(tampered, NOW)).toBeNull()
    expect(
      verifiedBellLiveSipMetadata(
        current.filter((header) => header.name !== metadataHeader.name),
        NOW
      )
    ).toBeNull()
    expect(
      verifiedBellLiveSipMetadata(
        [...current, { ...metadataHeader, name: 'X-BP-METADATA' }],
        NOW
      )
    ).toBeNull()
  })

  it('continues accepting existing v1 call-only invitation signatures', () => {
    const expiresAt = Math.floor(NOW.getTime() / 1_000) + 300
    const legacyToken = createHmac('sha256', SECRET)
      .update('phone-bell-realtime-sip-v1')
      .update('\0')
      .update(CALL_SID)
      .update('\0')
      .update(String(expiresAt))
      .digest('base64url')
    const headers = [
      { name: 'x-bp-call-sid', value: CALL_SID },
      { name: 'x-bp-expires-at', value: String(expiresAt) },
      { name: 'x-bp-token', value: legacyToken },
    ]

    expect(verifiedBellLiveSipCallSid(headers, NOW)).toBe(CALL_SID)
    expect(verifiedBellLiveSipMetadata(headers, NOW)).toEqual({
      callSid: CALL_SID,
    })
  })

  it('rejects expired invitations even when their metadata is authentic', () => {
    const headers = headersFromSipUri(
      bellLiveSipUri(CALL_SID, NOW, METADATA) ?? ''
    )
    expect(
      verifiedBellLiveSipMetadata(
        headers,
        new Date(NOW.getTime() + 6 * 60 * 1_000)
      )
    ).toBeNull()
  })

  it('enforces separate SIP address and header limits with maximum bounded hints', () => {
    vi.stubEnv('OPENAI_PROJECT_ID', `proj_${'p'.repeat(128)}`)
    const uri = bellLiveSipUri(CALL_SID, NOW, {
      callerName: 'N'.repeat(96),
      fromCity: 'C'.repeat(96),
      fromState: 'S'.repeat(32),
      fromZip: 'Z'.repeat(16),
      fromCountry: 'O'.repeat(8),
      areaCode: '415',
    })

    expect(uri).not.toBeNull()
    expect(uri?.length).toBeGreaterThan(255)
    expect(uri?.split('?')[0].length).toBeLessThan(255)
    expect(uri?.split('?')[1].length).toBeLessThan(1024)
    expect(
      verifiedBellLiveSipMetadata(headersFromSipUri(uri ?? ''), NOW)
    ).toMatchObject({ callerName: 'N'.repeat(96), fromCity: 'C'.repeat(96) })
  })
})

describe('bounded handoff metadata codec', () => {
  it('trims controls and byte-bounds Unicode without forwarding IDs or arbitrary data', () => {
    const encoded = encodePhoneHandoffMetadata({
      callerName: `  Jane\nCaller${'😀'.repeat(96)}`,
      fromCity: '  San Francisco  ',
      areaCode: '415',
      areaDescription: 'untrusted description',
      callSid: 'CA_other',
      messageSid: 'SM_private',
    })
    const metadata = decodePhoneHandoffMetadata(encoded ?? '')

    expect(encoded?.length).toBeLessThanOrEqual(600)
    expect(metadata?.callerName).toMatch(/^Jane Caller😀/)
    expect(
      Buffer.byteLength(metadata?.callerName ?? '', 'utf8')
    ).toBeLessThanOrEqual(96)
    expect(metadata?.fromCity).toBe('San Francisco')
    expect(metadata?.areaDescription).toBe('San Francisco, CA')
    expect(metadata).not.toHaveProperty('callSid')
    expect(metadata).not.toHaveProperty('messageSid')
  })

  it.each([
    [],
    { callSid: CALL_SID },
    { phoneNumber: '+15551234567' },
    { n: 123 },
    { n: 'untrimmed ' },
    { n: 'N'.repeat(97) },
    { n: 'line\nbreak' },
    { a: 'oops' },
  ])('rejects malformed or additional decoded fields %j', (value) => {
    const encoded = Buffer.from(JSON.stringify(value)).toString('base64url')
    expect(decodePhoneHandoffMetadata(encoded)).toBeNull()
  })

  it('rejects malformed base64url and oversized inputs', () => {
    expect(decodePhoneHandoffMetadata('')).toBeNull()
    expect(decodePhoneHandoffMetadata('%%%')).toBeNull()
    expect(decodePhoneHandoffMetadata('a'.repeat(601))).toBeNull()
    expect(encodePhoneHandoffMetadata({})).toBeUndefined()
  })
})
