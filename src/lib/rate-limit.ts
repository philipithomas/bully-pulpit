import { checkRateLimit as vercelCheckRateLimit } from '@vercel/firewall'

export type RateLimitStatus = 'allowed' | 'limited' | 'unavailable'

/**
 * Rate limiting backed by the Vercel Firewall.
 *
 * `rule` maps to a Vercel Firewall rate-limit rule of the same ID (where the limit and
 * window are configured in the dashboard). `key` is the per-caller bucket — e.g.
 * `ip:1.2.3.4` or `email:foo@bar.com` — which lets us limit by request-body fields
 * (like email) that the WAF cannot see on its own.
 *
 * Returns true if the request should be allowed, false if rate-limited. Outside Vercel
 * (local `next dev`, CI, tests) this is a no-op that allows the request, since the
 * firewall is only enforced on deployed environments.
 */
export async function checkRateLimit(
  rule: string,
  key: string,
  request: Request
): Promise<boolean> {
  const status = await checkRateLimitStatus(rule, key, request)
  // Preserve the existing fail-open behavior for low-risk routes. Callers
  // protecting paid provider work use the tri-state API and choose a safer
  // fallback when the Firewall self-fetch is unavailable.
  return status !== 'limited'
}

export async function checkRateLimitStatus(
  rule: string,
  key: string,
  request: Request
): Promise<RateLimitStatus> {
  if (!process.env.VERCEL) return 'allowed'

  try {
    const { rateLimited, error } = await vercelCheckRateLimit(rule, {
      request,
      rateLimitKey: key,
    })
    // A missing ID means the protection is not active. Treat it like an
    // unavailable decision so paid callers take their safe fallback instead
    // of silently spending without a live limit.
    if (error === 'not-found') return 'unavailable'
    return rateLimited ? 'limited' : 'allowed'
  } catch (err) {
    console.error(`[rate-limit] check failed for rule "${rule}":`, err)
    return 'unavailable'
  }
}
