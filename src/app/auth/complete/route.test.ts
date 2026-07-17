import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { trackServerEventMock } = vi.hoisted(() => ({
  trackServerEventMock: vi.fn(async () => {}),
}))

vi.mock('@/lib/analytics/server', () => ({
  trackServerEvent: trackServerEventMock,
}))

import { GET } from '@/app/auth/complete/route'
import {
  MAGIC_LINK_COMPLETION_COOKIE,
  type MagicLinkCompletion,
  setMagicLinkCompletionCookie,
} from '@/lib/auth/magic-link-completion'

async function markerFor(completion: MagicLinkCompletion): Promise<string> {
  const response = NextResponse.next()
  await setMagicLinkCompletionCookie(response, completion)
  const marker = response.cookies.get(MAGIC_LINK_COMPLETION_COOKIE)?.value
  if (!marker) throw new Error('Expected completion marker')
  return marker
}

function completionRequest(marker?: string): NextRequest {
  return new NextRequest('https://www.philipithomas.com/auth/complete', {
    headers: marker
      ? { cookie: `${MAGIC_LINK_COMPLETION_COOKIE}=${marker}` }
      : undefined,
  })
}

function expectMarkerCleared(response: NextResponse): void {
  expect(
    response.headers
      .getSetCookie()
      .some(
        (cookie) =>
          cookie.startsWith(`${MAGIC_LINK_COMPLETION_COOKIE}=`) &&
          cookie.includes('Max-Age=0')
      )
  ).toBe(true)
}

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.stubEnv('JWT_SECRET', 'completion-test-secret-at-least-32-characters-long')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('GET /auth/complete', () => {
  it('records an Umami completion on the token-free request and lands on account', async () => {
    const marker = await markerFor({
      newsletter: 'umami',
      newSubscriber: false,
      destination: 'account',
    })
    const request = completionRequest(marker)

    const response = await GET(request)

    expect(response.headers.get('location')).toBe(
      'https://www.philipithomas.com/account?signed-in=1'
    )
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(trackServerEventMock).toHaveBeenCalledWith(
      request,
      'Newsletter signup completed',
      {
        method: 'email_link',
        placement: 'unknown',
        newsletter: 'umami',
        new_subscriber: false,
      }
    )
    expect(request.url).toBe('https://www.philipithomas.com/auth/complete')
    expectMarkerCleared(response)
  })

  it('records a non-Umami completion and lands on the homepage', async () => {
    const marker = await markerFor({
      newsletter: 'contraption',
      newSubscriber: true,
      destination: 'home',
    })

    const response = await GET(completionRequest(marker))

    expect(response.headers.get('location')).toBe(
      'https://www.philipithomas.com/?signed-in=1'
    )
    expect(trackServerEventMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'Newsletter signup completed',
      expect.objectContaining({
        newsletter: 'contraption',
        new_subscriber: true,
      })
    )
    expectMarkerCleared(response)
  })

  it.each([
    ['missing', undefined],
    ['tampered', 'not-a-valid-marker'],
  ])('does not track a %s completion marker', async (_label, marker) => {
    const response = await GET(completionRequest(marker))

    expect(response.headers.get('location')).toBe(
      'https://www.philipithomas.com/'
    )
    expect(trackServerEventMock).not.toHaveBeenCalled()
    expectMarkerCleared(response)
  })

  it('does not track an expired completion marker', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-17T20:00:00Z'))
    const marker = await markerFor({
      newsletter: 'umami',
      newSubscriber: false,
      destination: 'account',
    })
    vi.setSystemTime(new Date('2026-07-17T20:03:00Z'))

    const response = await GET(completionRequest(marker))

    expect(response.headers.get('location')).toBe(
      'https://www.philipithomas.com/'
    )
    expect(trackServerEventMock).not.toHaveBeenCalled()
    expectMarkerCleared(response)
  })

  it('still redirects and consumes the marker when analytics fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    trackServerEventMock.mockRejectedValueOnce(new Error('analytics down'))
    const marker = await markerFor({
      newsletter: 'umami',
      newSubscriber: false,
      destination: 'account',
    })

    const response = await GET(completionRequest(marker))

    expect(response.headers.get('location')).toBe(
      'https://www.philipithomas.com/account?signed-in=1'
    )
    expectMarkerCleared(response)
  })
})
