export const CSP_REPORT_ENDPOINT = '/api/csp-report'
export const CSP_REPORTING_GROUP = 'csp-endpoint'
export const CSP_REPORTING_ENDPOINTS = `${CSP_REPORTING_GROUP}="${CSP_REPORT_ENDPOINT}"`

function buildContentSecurityPolicy(options: {
  allowDevelopmentEval: boolean
  allowInline: boolean
  reportOnly: boolean
}): string {
  const scriptSources = [
    "'self'",
    ...(options.allowInline ? ["'unsafe-inline'"] : []),
    ...(options.allowDevelopmentEval ? ["'unsafe-eval'"] : []),
    'https://static.cloudflareinsights.com',
    'https://accounts.google.com',
  ]
  const styleSources = [
    "'self'",
    ...(options.allowInline ? ["'unsafe-inline'"] : []),
    'https://fonts.philipithomas.com',
  ]

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    `style-src ${styleSources.join(' ')}`,
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
    ...(options.reportOnly
      ? [
          `report-uri ${CSP_REPORT_ENDPOINT}`,
          `report-to ${CSP_REPORTING_GROUP}`,
        ]
      : []),
  ].join('; ')
}

export function contentSecurityPolicy(options?: {
  allowDevelopmentEval?: boolean
}): string {
  const allowDevelopmentEval =
    options?.allowDevelopmentEval ?? process.env.NODE_ENV === 'development'
  // Production Next.js does not require eval. Development retains it for
  // Turbopack/HMR source transforms. The enforced policy keeps inline
  // compatibility while the stricter candidate below measures nonce readiness.
  return buildContentSecurityPolicy({
    allowDevelopmentEval,
    allowInline: true,
    reportOnly: false,
  })
}

export function reportOnlyContentSecurityPolicy(): string {
  return buildContentSecurityPolicy({
    allowDevelopmentEval: false,
    allowInline: false,
    reportOnly: true,
  })
}

export const CONTENT_SECURITY_POLICY = contentSecurityPolicy()
export const CONTENT_SECURITY_POLICY_REPORT_ONLY =
  reportOnlyContentSecurityPolicy()
