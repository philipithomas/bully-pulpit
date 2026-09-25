export type SecurityHeader = {
  key: string
  value: string
}

// HSTS is deliberately absent here. Vercel applies it at the TLS/domain edge,
// including the apex-to-www redirect that never reaches this configuration.
// Adding includeSubDomains only to www would not protect sibling subdomains and
// would give a misleading impression of domain-wide coverage.
export const BROWSER_SECURITY_HEADERS: SecurityHeader[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  // Google Identity Services uses a cross-origin popup. This policy isolates
  // other top-level navigations while retaining the opener relationship OAuth
  // needs; `same-origin` would break that flow.
  {
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin-allow-popups',
  },
]
