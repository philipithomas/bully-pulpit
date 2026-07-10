import { describe, expect, it } from 'vitest'
import {
  CONTENT_SECURITY_POLICY,
  CONTENT_SECURITY_POLICY_REPORT_ONLY,
  CSP_REPORT_ENDPOINT,
  CSP_REPORTING_ENDPOINTS,
  contentSecurityPolicy,
} from '@/lib/security/csp'

describe('Content Security Policy', () => {
  it('blocks common injection follow-ons without allowing eval', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'")
    expect(CONTENT_SECURITY_POLICY).toContain("base-uri 'self'")
    expect(CONTENT_SECURITY_POLICY).toContain("form-action 'self'")
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'")
    expect(CONTENT_SECURITY_POLICY).not.toContain("'unsafe-eval'")
  })

  it('retains Google, BotID, and known embed origins', () => {
    expect(CONTENT_SECURITY_POLICY).toContain('https://accounts.google.com')
    expect(CONTENT_SECURITY_POLICY).toContain("frame-src 'self'")
    expect(CONTENT_SECURITY_POLICY).toContain('https://www.youtube.com')
    expect(CONTENT_SECURITY_POLICY).toContain('https://open.spotify.com')
  })

  it('allows eval only for the local development toolchain', () => {
    expect(contentSecurityPolicy({ allowDevelopmentEval: true })).toContain(
      "'unsafe-eval'"
    )
    expect(
      contentSecurityPolicy({ allowDevelopmentEval: false })
    ).not.toContain("'unsafe-eval'")
  })

  it('stages a nonce-ready policy without weakening the enforced policy', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("'unsafe-inline'")
    expect(CONTENT_SECURITY_POLICY_REPORT_ONLY).not.toContain("'unsafe-inline'")
    expect(CONTENT_SECURITY_POLICY_REPORT_ONLY).not.toContain("'unsafe-eval'")
    expect(CONTENT_SECURITY_POLICY_REPORT_ONLY).toContain(
      `report-uri ${CSP_REPORT_ENDPOINT}`
    )
    expect(CONTENT_SECURITY_POLICY_REPORT_ONLY).toContain(
      'report-to csp-endpoint'
    )
    expect(CSP_REPORTING_ENDPOINTS).toBe('csp-endpoint="/api/csp-report"')
  })
})
