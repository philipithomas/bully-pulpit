export function contentSecurityPolicy(options?: {
  allowDevelopmentEval?: boolean
}): string {
  const allowDevelopmentEval =
    options?.allowDevelopmentEval ?? process.env.NODE_ENV === 'development'
  const scriptSources = [
    "'self'",
    "'unsafe-inline'",
    ...(allowDevelopmentEval ? ["'unsafe-eval'"] : []),
    'https://static.cloudflareinsights.com',
    'https://accounts.google.com',
  ]

  return [
    "default-src 'self'",
    // Production Next.js does not require eval. Development retains it for
    // Turbopack/HMR source transforms only. Inline remains until the root
    // bootstrap and third-party scripts can move to a nonce in a separate pass.
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://fonts.philipithomas.com",
    "font-src 'self' https://fonts.philipithomas.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://cloudflareinsights.com https://accounts.google.com https://oauth2.googleapis.com",
    // 'self' is required by Vercel BotID/Kasada, which frames its bot-check
    // challenge from a same-origin /…/fp path (withBotId proxies it first-party).
    "frame-src 'self' https://accounts.google.com https://maps.google.com https://www.google.com https://www.youtube.com https://open.spotify.com https://podcasters.spotify.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export const CONTENT_SECURITY_POLICY = contentSecurityPolicy()
