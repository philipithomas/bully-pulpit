import { decodeJwt } from 'jose'
import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  NEW_SUBSCRIBER_ONBOARDING_COOKIE,
  setNewSubscriberOnboardingCookie,
  signSession,
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
    expect(decodeJwt(marker as string)).toMatchObject({
      iss: 'https://www.philipithomas.com',
      aud: 'philipithomas.com:new-subscriber-onboarding',
      purpose: 'new-subscriber-onboarding',
    })
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
    expect(cookie).toContain('Secure')
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

  it('does not accept a subscriber session token as an onboarding marker', async () => {
    const session = await signSession({
      ...subscriber,
      email: 'reader@example.com',
      name: null,
      sessionVersion: 1,
    })

    await expect(
      verifyNewSubscriberOnboardingCookie(session, subscriber.uuid)
    ).resolves.toBe(false)
  })

  it('does not clear an existing marker for a duplicate valid completion', async () => {
    const firstResponse = NextResponse.json({ ok: true })
    await setNewSubscriberOnboardingCookie(firstResponse, subscriber, true)
    const marker = firstResponse.cookies.get(
      NEW_SUBSCRIBER_ONBOARDING_COOKIE
    )?.value
    const response = NextResponse.json({ ok: true })

    await setNewSubscriberOnboardingCookie(response, subscriber, false)

    expect(
      response.headers
        .getSetCookie()
        .some((value) =>
          value.startsWith(`${NEW_SUBSCRIBER_ONBOARDING_COOKIE}=`)
        )
    ).toBe(false)
    expect(
      await verifyNewSubscriberOnboardingCookie(
        marker as string,
        subscriber.uuid
      )
    ).toBe(true)
  })
})
