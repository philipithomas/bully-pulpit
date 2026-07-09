import type { BeforeSendEvent } from '@vercel/analytics'
import { describe, expect, it } from 'vitest'
import {
  isPublicAnalyticsPath,
  redactAnalyticsEvent,
} from '@/lib/analytics/privacy'

const origin = 'https://www.philipithomas.com'

function event(url: string): BeforeSendEvent {
  return { type: 'pageview', url }
}

describe('public analytics privacy', () => {
  it.each([
    '/account',
    '/account/settings',
    '/auth/verify?token=secret',
    '/printing-press',
    '/printing-press/bell',
    '/admin',
    '/unsubscribe/private-token',
  ])('drops private path %s', (pathname) => {
    expect(redactAnalyticsEvent(event(pathname), origin)).toBeNull()
  })

  it('does not overmatch similarly named public paths', () => {
    expect(isPublicAnalyticsPath('/accounting')).toBe(true)
    expect(isPublicAnalyticsPath('/administrator')).toBe(true)
  })

  it('removes query strings and hashes from public event URLs', () => {
    expect(
      redactAnalyticsEvent(
        event('/photography?q=private+search#results'),
        origin
      )
    ).toEqual({ type: 'pageview', url: `${origin}/photography` })
  })

  it('fails closed for malformed URLs', () => {
    expect(redactAnalyticsEvent(event('http://['), origin)).toBeNull()
  })
})
