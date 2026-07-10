import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { config, proxy } from '@/proxy'

function mutation(
  path: string,
  headers: Record<string, string> = {},
  method = 'POST'
) {
  return new NextRequest(`https://www.philipithomas.com${path}`, {
    method,
    headers,
  })
}

const sameOriginHeaders = {
  origin: 'https://www.philipithomas.com',
  'sec-fetch-site': 'same-origin',
  'content-type': 'application/json; charset=utf-8',
}

describe('browser mutation proxy', () => {
  it('matches only browser auth and Printing press routes', () => {
    for (const url of ['/api/auth/preferences', '/api/printing-press/send']) {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true)
    }
    for (const url of [
      '/api/phone/sms',
      '/api/cron/subscriber-backup',
      '/api/unsubscribe/token',
      '/api/subscribe',
    ]) {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false)
    }
  })

  it('allows exact-origin JSON mutations', () => {
    const response = proxy(
      mutation('/api/printing-press/send', sameOriginHeaders)
    )
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it.each([
    ['missing origin', { ...sameOriginHeaders, origin: '' }],
    [
      'wrong origin',
      { ...sameOriginHeaders, origin: 'https://attacker.example' },
    ],
    [
      'cross-site fetch metadata',
      { ...sameOriginHeaders, 'sec-fetch-site': 'cross-site' },
    ],
    ['missing fetch metadata', { ...sameOriginHeaders, 'sec-fetch-site': '' }],
  ])('rejects %s before the route', async (_label, headers) => {
    const response = proxy(mutation('/api/auth/preferences', headers, 'PATCH'))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'Cross-site request denied',
    })
  })

  it('requires JSON for normal mutations', async () => {
    const response = proxy(
      mutation('/api/printing-press/phone/call', {
        ...sameOriginHeaders,
        'content-type': 'text/plain',
      })
    )
    expect(response.status).toBe(415)
    expect(await response.json()).toEqual({
      error: 'Content-Type must be application/json',
    })
  })

  it('requires CSV only on the subscriber import route', () => {
    const response = proxy(
      mutation('/api/printing-press/subscribers/import', {
        ...sameOriginHeaders,
        'content-type': 'text/csv; charset=utf-8',
      })
    )
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('does not constrain safe reads', () => {
    const response = proxy(
      mutation('/api/printing-press/subscribers/export', {}, 'GET')
    )
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })
})
