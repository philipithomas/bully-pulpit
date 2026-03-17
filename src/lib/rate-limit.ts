const attempts = new Map<string, { count: number; resetAt: number }>()

// Clean up expired entries periodically
setInterval(
  () => {
    const now = Date.now()
    for (const [key, value] of attempts) {
      if (now > value.resetAt) {
        attempts.delete(key)
      }
    }
  },
  60 * 1000 // every minute
)

/**
 * Simple in-memory rate limiter.
 * Returns true if the request should be allowed, false if rate-limited.
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): boolean {
  const now = Date.now()
  const entry = attempts.get(key)

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  entry.count++
  return entry.count <= maxAttempts
}
