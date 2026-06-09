import { checkRateLimit as vercelCheckRateLimit } from '@vercel/firewall'

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
  if (!process.env.VERCEL) return true

  try {
    const { rateLimited } = await vercelCheckRateLimit(rule, {
      request,
      rateLimitKey: key,
    })
    return !rateLimited
  } catch (err) {
    // Fail open: @vercel/firewall throws on unexpected statuses from its
    // self-fetch (e.g. preview deployment protection, transient 5xx) — that
    // must not 500 the route the limit is protecting.
    console.error(`[rate-limit] check failed for rule "${rule}":`, err)
    return true
  }
}
