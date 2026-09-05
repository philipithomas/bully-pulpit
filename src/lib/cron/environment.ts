/**
 * Vercel runs configured Cron Jobs only for production deployments. Preview
 * deployments can still receive manual requests and may share DATABASE_URL,
 * so their diagnostic health code must never mutate the production heartbeat.
 */
export function cronHealthWritesAllowed(
  vercelEnvironment = process.env.VERCEL_ENV
): boolean {
  return vercelEnvironment !== 'preview'
}
