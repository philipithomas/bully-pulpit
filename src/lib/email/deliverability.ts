import { resolve4, resolve6, resolveMx } from 'node:dns/promises'

/**
 * DNS-based deliverability check, run before sending a confirmation or OTP
 * email. A domain that cannot receive mail (typos like gmial.com, dead
 * domains) generates a hard bounce that damages SES sender reputation, so the
 * flows reject it up front.
 *
 * Policy: fail OPEN. Only a definitive DNS answer that the domain has no mail
 * host returns false. Resolver hiccups, SERVFAILs, and timeouts return true —
 * a flaky resolver must never block a real person from signing up.
 */

const TIMEOUT_MS = 2500
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX_ENTRIES = 500

/** Definitive "no such record" answers; everything else is a resolver fault. */
const NO_RECORD_CODES = new Set(['ENODATA', 'ENOTFOUND'])

type CacheEntry = { deliverable: boolean; expires: number }

const cache = new Map<string, CacheEntry>()

/** Test-only: empties the per-instance domain cache. */
export function clearDeliverabilityCache(): void {
  cache.clear()
}

function isNoRecordError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const code = (err as { code?: unknown }).code
  return typeof code === 'string' && NO_RECORD_CODES.has(code)
}

/**
 * Implicit MX (RFC 5321 section 5.1): a domain with no MX records but an A or
 * AAAA record is treated as its own mail host.
 */
async function hasAddressRecord(domain: string): Promise<boolean> {
  const results = await Promise.allSettled([resolve4(domain), resolve6(domain)])
  if (results.some((r) => r.status === 'fulfilled' && r.value.length > 0)) {
    return true
  }
  // Undeliverable only when both address families definitively have no
  // records. A resolver fault on either lookup fails open.
  const definitivelyEmpty = results.every(
    (r) =>
      (r.status === 'rejected' && isNoRecordError(r.reason)) ||
      (r.status === 'fulfilled' && r.value.length === 0)
  )
  return !definitivelyEmpty
}

async function resolveDeliverability(domain: string): Promise<boolean> {
  let records: Awaited<ReturnType<typeof resolveMx>>
  try {
    records = await resolveMx(domain)
  } catch (err) {
    if (isNoRecordError(err)) {
      return hasAddressRecord(domain)
    }
    // Fail open on SERVFAIL, network errors, and anything else non-definitive.
    return true
  }
  if (records.length === 0) {
    return hasAddressRecord(domain)
  }
  // Null MX (RFC 7505): an MX record with "." as the exchange explicitly
  // declares the domain accepts no mail, and it suppresses the implicit-MX
  // fallback. The domain is deliverable only if a usable exchange exists.
  return records.some((r) => r.exchange !== '' && r.exchange !== '.')
}

/**
 * Returns whether `email`'s domain can plausibly receive mail, based on MX
 * records (with the RFC 5321 implicit-MX fallback and RFC 7505 null-MX
 * rejection). Results are cached per domain for ten minutes, positive and
 * negative alike. The whole check is capped at ~2.5 seconds and fails open.
 *
 * Format validation is the caller's job: input without an extractable domain
 * abstains (returns true) rather than rejecting with a misleading message.
 */
export async function canReceiveMail(email: string): Promise<boolean> {
  const at = email.lastIndexOf('@')
  if (at < 1) return true
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase()
  if (!domain) return true

  const cached = cache.get(domain)
  if (cached && cached.expires > Date.now()) {
    return cached.deliverable
  }

  const lookup = resolveDeliverability(domain).then((deliverable) => {
    cache.delete(domain)
    if (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(domain, { deliverable, expires: Date.now() + CACHE_TTL_MS })
    return deliverable
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(true), TIMEOUT_MS)
  })

  try {
    // Hard cap on the whole check: if DNS is slow, fail open instead of
    // holding up the signup. The in-flight lookup still populates the cache
    // for the next attempt when it eventually settles.
    return await Promise.race([lookup, timeout])
  } finally {
    clearTimeout(timer)
  }
}
