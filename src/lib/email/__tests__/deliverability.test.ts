import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:dns/promises', () => ({
  resolveMx: vi.fn(),
  resolve4: vi.fn(),
  resolve6: vi.fn(),
}))

import { resolve4, resolve6, resolveMx } from 'node:dns/promises'
import {
  canReceiveMail,
  clearDeliverabilityCache,
} from '@/lib/email/deliverability'

const mx = vi.mocked(resolveMx)
// node:dns/promises resolve4/resolve6 are overloaded; narrow the mock to the
// single-argument overload the code under test uses. The overload set no
// longer overlaps structurally, so the cast goes through unknown.
const a = vi.mocked(resolve4) as unknown as ReturnType<
  typeof vi.fn<(hostname: string) => Promise<string[]>>
>
const aaaa = vi.mocked(resolve6) as unknown as ReturnType<
  typeof vi.fn<(hostname: string) => Promise<string[]>>
>

function dnsError(code: string): Error {
  return Object.assign(new Error(`query ${code}`), { code })
}

beforeEach(() => {
  vi.useRealTimers()
  clearDeliverabilityCache()
  mx.mockReset()
  a.mockReset()
  aaaa.mockReset()
})

describe('canReceiveMail', () => {
  it('returns true when the domain has an MX record', async () => {
    mx.mockResolvedValue([{ exchange: 'mx1.example.com', priority: 10 }])

    await expect(canReceiveMail('person@example.com')).resolves.toBe(true)
    expect(mx).toHaveBeenCalledWith('example.com')
    expect(a).not.toHaveBeenCalled()
    expect(aaaa).not.toHaveBeenCalled()
  })

  it('returns false for a null MX (RFC 7505) without falling back to A/AAAA', async () => {
    mx.mockResolvedValue([{ exchange: '.', priority: 0 }])
    a.mockResolvedValue(['192.0.2.10'])

    await expect(canReceiveMail('person@refuses.example')).resolves.toBe(false)
    // Null MX explicitly opts the domain out; implicit MX must not apply.
    expect(a).not.toHaveBeenCalled()
    expect(aaaa).not.toHaveBeenCalled()
  })

  it('returns true when one MX record is usable alongside a null exchange', async () => {
    mx.mockResolvedValue([
      { exchange: '.', priority: 0 },
      { exchange: 'mx2.example.com', priority: 20 },
    ])

    await expect(canReceiveMail('person@mixed.example')).resolves.toBe(true)
  })

  it('falls back to an A record when MX yields ENODATA (implicit MX, RFC 5321)', async () => {
    mx.mockRejectedValue(dnsError('ENODATA'))
    a.mockResolvedValue(['192.0.2.10'])
    aaaa.mockRejectedValue(dnsError('ENODATA'))

    await expect(canReceiveMail('person@bare-a.example')).resolves.toBe(true)
  })

  it('falls back to an AAAA record when MX yields ENOTFOUND', async () => {
    mx.mockRejectedValue(dnsError('ENOTFOUND'))
    a.mockRejectedValue(dnsError('ENOTFOUND'))
    aaaa.mockResolvedValue(['2001:db8::1'])

    await expect(canReceiveMail('person@bare-aaaa.example')).resolves.toBe(true)
  })

  it('falls back to A/AAAA when MX resolves to an empty record set', async () => {
    mx.mockResolvedValue([])
    a.mockResolvedValue(['192.0.2.20'])
    aaaa.mockRejectedValue(dnsError('ENODATA'))

    await expect(canReceiveMail('person@empty-mx.example')).resolves.toBe(true)
  })

  it('returns false when the domain has no MX, A, or AAAA records', async () => {
    mx.mockRejectedValue(dnsError('ENOTFOUND'))
    a.mockRejectedValue(dnsError('ENOTFOUND'))
    aaaa.mockRejectedValue(dnsError('ENOTFOUND'))

    await expect(canReceiveMail('person@gmial.example')).resolves.toBe(false)
  })

  it('fails open on a SERVFAIL from the MX lookup', async () => {
    mx.mockRejectedValue(dnsError('ESERVFAIL'))

    await expect(canReceiveMail('person@flaky.example')).resolves.toBe(true)
    // A resolver fault is not "no MX records"; the fallback should not run.
    expect(a).not.toHaveBeenCalled()
    expect(aaaa).not.toHaveBeenCalled()
  })

  it('fails open when the A/AAAA fallback hits a resolver fault', async () => {
    mx.mockRejectedValue(dnsError('ENODATA'))
    a.mockRejectedValue(dnsError('ESERVFAIL'))
    aaaa.mockRejectedValue(dnsError('ENOTFOUND'))

    await expect(canReceiveMail('person@half-flaky.example')).resolves.toBe(
      true
    )
  })

  it('fails open when DNS exceeds the overall timeout', async () => {
    vi.useFakeTimers()
    mx.mockImplementation(() => new Promise(() => {}))

    const result = canReceiveMail('person@slow.example')
    await vi.advanceTimersByTimeAsync(2500)

    await expect(result).resolves.toBe(true)
  })

  it('caches a positive result per domain', async () => {
    mx.mockResolvedValue([{ exchange: 'mx1.example.com', priority: 10 }])

    await expect(canReceiveMail('one@cached.example')).resolves.toBe(true)
    await expect(canReceiveMail('two@CACHED.example')).resolves.toBe(true)
    expect(mx).toHaveBeenCalledTimes(1)
  })

  it('caches a negative result per domain', async () => {
    mx.mockRejectedValue(dnsError('ENOTFOUND'))
    a.mockRejectedValue(dnsError('ENOTFOUND'))
    aaaa.mockRejectedValue(dnsError('ENOTFOUND'))

    await expect(canReceiveMail('one@dead.example')).resolves.toBe(false)
    await expect(canReceiveMail('two@dead.example')).resolves.toBe(false)
    expect(mx).toHaveBeenCalledTimes(1)
  })

  it('re-resolves a domain after the cache TTL passes', async () => {
    vi.useFakeTimers()
    mx.mockResolvedValue([{ exchange: 'mx1.example.com', priority: 10 }])

    await expect(canReceiveMail('one@ttl.example')).resolves.toBe(true)
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1)
    await expect(canReceiveMail('two@ttl.example')).resolves.toBe(true)

    expect(mx).toHaveBeenCalledTimes(2)
  })

  it('abstains (returns true) for input without an extractable domain', async () => {
    await expect(canReceiveMail('not-an-email')).resolves.toBe(true)
    await expect(canReceiveMail('@no-local.example')).resolves.toBe(true)
    await expect(canReceiveMail('person@')).resolves.toBe(true)
    await expect(canReceiveMail('')).resolves.toBe(true)
    // Format validation is the caller's job: no DNS lookups happen.
    expect(mx).not.toHaveBeenCalled()
    expect(a).not.toHaveBeenCalled()
    expect(aaaa).not.toHaveBeenCalled()
  })
})
