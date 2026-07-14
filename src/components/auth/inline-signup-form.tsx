'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuthContext } from '@/components/auth/auth-provider'
import { EmailCodeConfirmationDialog } from '@/components/auth/email-code-confirmation-dialog'
import type { GoogleSignInUser } from '@/components/auth/google-sign-in'
import { matchesSubmittedEmail } from '@/components/auth/signup-completion'
import { SmsSubscribePrompt } from '@/components/auth/sms-subscribe-prompt'
import { ArrowIcon } from '@/components/ui/arrow-icon'
import { Spinner } from '@/components/ui/spinner'
import {
  type AnalyticsPlacement,
  summarizeNewsletters,
  trackClientEvent,
} from '@/lib/analytics/events'
import type { Newsletter } from '@/lib/content/types'
import { formatMemberCount } from '@/lib/format-member-count'
import { defaultSignupNewsletters } from '@/lib/newsletters'
import { getExternalReferrer } from '@/lib/referrer'

interface Props {
  hideWhenLoggedIn?: boolean
  autoFocus?: boolean
  className?: string
  headerText?: string
  newsletters?: Newsletter[]
  align?: 'start' | 'center'
  buttonClassName?: string
  subscribeEndpoint?: string
  confirmedMessage?: string
  initialSubscriberCount?: number | null
  smsSignupPhoneNumber?: string | null
  smsSignupDisplayNumber?: string | null
  analyticsPlacement?: AnalyticsPlacement
  /**
   * When true and no initial count was provided, fetches the live subscriber
   * count client-side and uses it as the header text ("Join N other subscribers:").
   */
  showSubscriberCount?: boolean
}

type Step = 'email' | 'code' | 'confirmed'

export function InlineSignupForm({
  hideWhenLoggedIn = false,
  autoFocus = false,
  className,
  headerText,
  newsletters = [...defaultSignupNewsletters],
  align = 'start',
  buttonClassName = 'btn btn-primary',
  subscribeEndpoint = '/api/subscribe',
  confirmedMessage = 'You are subscribed by email.',
  initialSubscriberCount = null,
  smsSignupPhoneNumber = null,
  smsSignupDisplayNumber = null,
  analyticsPlacement = 'unknown',
  showSubscriberCount = false,
}: Props) {
  const { user, hasSession, loading: authLoading } = useAuthContext()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<Step>('email')
  const [loading, setLoading] = useState(false)
  const [subscriberCount, setSubscriberCount] = useState<number | null>(
    initialSubscriberCount
  )
  const submittingRef = useRef(false)

  useEffect(() => {
    if (!showSubscriberCount || initialSubscriberCount !== null) return
    fetch('/api/stats/subscribers/count')
      .then((res) => res.json())
      .then((data) => setSubscriberCount(data.count ?? null))
      .catch(() => {})
  }, [initialSubscriberCount, showSubscriberCount])

  const resolvedHeaderText =
    headerText ??
    (subscriberCount !== null && subscriberCount > 0
      ? `Join ${formatMemberCount(subscriberCount)} other subscribers:`
      : undefined)

  const handleEmailChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value),
    []
  )

  const handleDifferentEmail = useCallback(() => {
    setStep('email')
    setCode('')
  }, [])

  const handleEmailSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!email) return

      trackClientEvent('Newsletter signup submitted', {
        method: 'email',
        placement: analyticsPlacement,
        newsletter: summarizeNewsletters(newsletters),
        signed_in: Boolean(user),
      })
      setLoading(true)
      try {
        const res = await fetch(subscribeEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            source: getExternalReferrer(),
            newsletters,
            analytics_placement: analyticsPlacement,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          toast.error(data.error ?? 'Could not subscribe. Try again.')
          return
        }
        const data = await res.json()
        if (data.status === 'confirmed') {
          setStep('confirmed')
          return
        }
        setStep('code')
      } catch {
        toast.error('Could not subscribe. Try again.')
      } finally {
        setLoading(false)
      }
    },
    [analyticsPlacement, email, newsletters, subscribeEndpoint, user]
  )

  const verifyCode = useCallback(
    async (value: string) => {
      if (submittingRef.current) return
      submittingRef.current = true
      setLoading(true)
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            code: value,
            newsletters,
            analytics_placement: analyticsPlacement,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          toast.error(data.error ?? 'That code did not work. Try again.')
          setCode('')
          return
        }
        const url = new URL(window.location.href)
        url.searchParams.set('signed-in', '1')
        window.location.assign(url.toString())
      } catch {
        toast.error('That code did not work. Try again.')
        setCode('')
      } finally {
        setLoading(false)
        submittingRef.current = false
      }
    },
    [analyticsPlacement, email, newsletters]
  )

  const initialMemberClassName =
    hideWhenLoggedIn && hasSession === null ? '[[data-member]_&]:hidden' : ''
  const rootClassName = `${initialMemberClassName} ${className ?? ''}`

  const finishSignedIn = useCallback(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('signed-in', '1')
    window.location.assign(url.toString())
  }, [])
  const handleGoogleConfirmationSuccess = useCallback(
    (googleUser: GoogleSignInUser) => {
      // A different Google account becomes the authenticated identity. The
      // server applies pending active-newsletter opt-ins to that account only.
      if (!matchesSubmittedEmail(googleUser.email, email)) return true
      finishSignedIn()
      return false
    },
    [email, finishSignedIn]
  )

  useEffect(() => {
    if (step !== 'code') return

    let cancelled = false

    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && matchesSubmittedEmail(data.user?.email, email)) {
          finishSignedIn()
        }
      } catch {}
    }

    const interval = window.setInterval(checkSession, 2000)
    window.addEventListener('focus', checkSession)
    void checkSession()

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('focus', checkSession)
    }
  }, [email, step, finishSignedIn])

  if (hideWhenLoggedIn && hasSession && authLoading) return null
  if (hideWhenLoggedIn && user) return null

  if (step === 'confirmed') {
    return (
      <div
        className={`flex flex-col ${
          align === 'center' ? 'items-center text-center' : 'items-start'
        } ${rootClassName}`}
      >
        <p className="font-sans text-sm font-semibold text-gray-800">
          Confirmed
        </p>
        <p className="mt-1 max-w-md font-serif text-sm leading-relaxed text-gray-600">
          {confirmedMessage}
        </p>
      </div>
    )
  }

  return (
    <>
      <form
        onSubmit={handleEmailSubmit}
        className={`flex flex-col ${
          align === 'center' ? 'items-center' : 'items-start'
        } ${rootClassName}`}
      >
        {resolvedHeaderText ? (
          <p className="font-sans text-lg font-medium mb-3 text-gray-800">
            {resolvedHeaderText}
          </p>
        ) : null}
        <div className="flex items-center w-full max-w-md">
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={handleEmailChange}
            placeholder="Your email"
            aria-label="Email address"
            required
            autoFocus={autoFocus}
            className="border border-gray-300 bg-white px-3 py-2 flex-grow w-full text-sm pointer-coarse:text-base h-10 font-sans"
          />
          <button
            type="submit"
            disabled={loading}
            className={`${buttonClassName} h-10 shrink-0`}
          >
            <span className="btn-text">
              {loading ? <Spinner className="h-4 w-4" /> : 'Subscribe'}
            </span>
            <span className="btn-arrow">
              {loading ? null : <ArrowIcon className="w-4 h-4" />}
            </span>
          </button>
        </div>
      </form>
      <SmsSubscribePrompt
        align={align}
        phoneDisplayNumber={smsSignupDisplayNumber}
        phoneNumber={smsSignupPhoneNumber}
        analyticsPlacement={analyticsPlacement}
        newsletter={summarizeNewsletters(newsletters)}
      />

      {step === 'code' ? (
        <EmailCodeConfirmationDialog
          code={code}
          email={email}
          loading={loading}
          onCodeChange={setCode}
          onDifferentEmail={handleDifferentEmail}
          onVerifyCode={verifyCode}
          googleAnalyticsPlacement={analyticsPlacement}
          googleNewsletters={newsletters}
          onGoogleSuccess={handleGoogleConfirmationSuccess}
        />
      ) : null}
    </>
  )
}
