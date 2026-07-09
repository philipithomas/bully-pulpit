import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  NEW_SUBSCRIBER_ONBOARDING_COOKIE,
  setNewSubscriberOnboardingCookie,
  verifyNewSubscriberOnboardingCookie,
} from '@/lib/auth/jwt'

const subscriber = { uuid: '00000000-0000-4000-8000-000000000001' }

beforeEach(() => {
  process.env.JWT_SECRET = 'onboarding-test-secret-at-least-32-characters'
})

describe('new subscriber onboarding marker', () => {
  it('sets a short-lived, signed, subscriber-bound HttpOnly cookie', async () => {
    const response = NextResponse.json({ ok: true })

    await setNewSubscriberOnboardingCookie(response, subscriber, true)

    const marker = response.cookies.get(NEW_SUBSCRIBER_ONBOARDING_COOKIE)?.value
    expect(marker).toBeTruthy()
    expect(
      await verifyNewSubscriberOnboardingCookie(
        marker as string,
        subscriber.uuid
      )
    ).toBe(true)
    expect(
      await verifyNewSubscriberOnboardingCookie(
        marker as string,
        '00000000-0000-4000-8000-000000000002'
      )
    ).toBe(false)

    const cookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith(`${NEW_SUBSCRIBER_ONBOARDING_COOKIE}=`))
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Max-Age=900')
    expect(cookie).toContain('SameSite=lax')
  })

  it('rejects a tampered marker', async () => {
    const response = NextResponse.json({ ok: true })
    await setNewSubscriberOnboardingCookie(response, subscriber, true)
    const marker = response.cookies.get(NEW_SUBSCRIBER_ONBOARDING_COOKIE)?.value

    expect(
      await verifyNewSubscriberOnboardingCookie(
        `${marker as string}tampered`,
        subscriber.uuid
      )
    ).toBe(false)
  })

  it('expires a stale marker for a returning subscriber', async () => {
    const response = NextResponse.json({ ok: true })

    await setNewSubscriberOnboardingCookie(response, subscriber, false)

    const cookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith(`${NEW_SUBSCRIBER_ONBOARDING_COOKIE}=`))
    expect(cookie).toMatch(/^bp_onboarding=;/)
    expect(cookie?.toLowerCase()).toMatch(/max-age=0|expires=thu, 01 jan 1970/)
  })
})
