import { describe, expect, it } from 'vitest'
import { cronHealthWritesAllowed } from '@/lib/cron/environment'

describe('cron health write environment', () => {
  it('makes preview deployments read-only', () => {
    expect(cronHealthWritesAllowed('preview')).toBe(false)
  })

  it.each([
    undefined,
    'development',
    'production',
  ])('preserves writes for %s', (environment) => {
    expect(cronHealthWritesAllowed(environment)).toBe(true)
  })
})
