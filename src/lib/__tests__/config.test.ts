import { afterEach, describe, expect, it } from 'vitest'
import { siteConfig } from '@/lib/config'

const ORIGINAL = process.env.ADMIN_EMAILS

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.ADMIN_EMAILS
  } else {
    process.env.ADMIN_EMAILS = ORIGINAL
  }
})

describe('siteConfig.adminEmails', () => {
  it('defaults to mail@philipithomas.com when ADMIN_EMAILS is unset', () => {
    delete process.env.ADMIN_EMAILS
    expect(siteConfig.adminEmails).toEqual(['mail@philipithomas.com'])
  })

  it('accepts a single bare email', () => {
    process.env.ADMIN_EMAILS = 'solo@example.com'
    expect(siteConfig.adminEmails).toEqual(['solo@example.com'])
  })

  it('accepts a comma-separated list, trimmed and lowercased', () => {
    process.env.ADMIN_EMAILS = ' One@Example.com , two@example.com ,'
    expect(siteConfig.adminEmails).toEqual([
      'one@example.com',
      'two@example.com',
    ])
  })
})
