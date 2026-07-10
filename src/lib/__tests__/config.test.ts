import { afterEach, describe, expect, it, vi } from 'vitest'
import { siteConfig } from '@/lib/config'
import { siteIdentity } from '@/lib/site-identity'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('siteConfig.adminEmails', () => {
  it('defaults to mail@philipithomas.com when ADMIN_EMAILS is unset', () => {
    vi.stubEnv('ADMIN_EMAILS', undefined)
    expect(siteConfig.adminEmails).toEqual(['mail@philipithomas.com'])
  })

  it('accepts a single bare email', () => {
    vi.stubEnv('ADMIN_EMAILS', 'solo@example.com')
    expect(siteConfig.adminEmails).toEqual(['solo@example.com'])
  })

  it('accepts a comma-separated list, trimmed and lowercased', () => {
    vi.stubEnv('ADMIN_EMAILS', ' One@Example.com , two@example.com ,')
    expect(siteConfig.adminEmails).toEqual([
      'one@example.com',
      'two@example.com',
    ])
  })
})

describe('siteConfig.url', () => {
  it('uses the stable branch URL on preview deployments', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv(
      'VERCEL_BRANCH_URL',
      'bully-pulpit-git-x-philipithomas.vercel.app'
    )
    expect(siteConfig.url).toBe(
      'https://bully-pulpit-git-x-philipithomas.vercel.app'
    )
  })

  it('uses localhost during next dev', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(siteConfig.url).toBe('http://localhost:3000')
  })

  it('uses the www production domain in production and in tests/builds', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(siteConfig.url).toBe('https://www.philipithomas.com')
    vi.unstubAllEnvs()
    expect(siteConfig.url).toBe('https://www.philipithomas.com')
  })
})

describe('siteConfig.emailSubjectPrefix', () => {
  it('is empty in production', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(siteConfig.emailSubjectPrefix).toBe('')
  })

  it('tags preview and development sends', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(siteConfig.emailSubjectPrefix).toBe('[PREVIEW] ')
    vi.stubEnv('VERCEL_ENV', 'development')
    expect(siteConfig.emailSubjectPrefix).toBe('[DEVELOPMENT] ')
  })

  it('tags local next dev without Vercel', () => {
    vi.stubEnv('VERCEL_ENV', undefined)
    vi.stubEnv('NODE_ENV', 'development')
    expect(siteConfig.emailSubjectPrefix).toBe('[DEVELOPMENT] ')
  })
})

describe('siteConfig.sesFromEmail', () => {
  it('wraps a bare address with the display name', () => {
    vi.stubEnv('SES_FROM_EMAIL', 'mail@philipithomas.com')
    expect(siteConfig.sesFromEmail).toBe(
      `${siteIdentity.name} <mail@philipithomas.com>`
    )
  })

  it('replaces an environment display name with the public name', () => {
    vi.stubEnv('SES_FROM_EMAIL', 'Custom Name <hi@example.com>')
    expect(siteConfig.sesFromEmail).toBe(
      `${siteIdentity.name} <hi@example.com>`
    )
  })

  it('defaults to the named production address', () => {
    vi.stubEnv('SES_FROM_EMAIL', undefined)
    expect(siteConfig.sesFromEmail).toBe(
      `${siteIdentity.name} <mail@philipithomas.com>`
    )
  })
})
