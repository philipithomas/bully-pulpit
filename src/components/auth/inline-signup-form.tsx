'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuthContext } from '@/components/auth/auth-provider'
import { GoogleSignInLink } from '@/components/auth/google-sign-in'
import { ArrowIcon } from '@/components/ui/arrow-icon'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import { Spinner } from '@/components/ui/spinner'
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
  allowExistingSubscriberOptIn?: boolean
  confirmedMessage?: string
  /**
   * When true, fetches the live subscriber count client-side and uses it as the
   * header text ("Join N other subscribers:"). Lets the host page stay static.
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
  allowExistingSubscriberOptIn = false,
  confirmedMessage = 'You are subscribed by email.',
  showSubscriberCount = false,
}: Props) {
  const { user, hasSession, loading: authLoading } = useAuthContext()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<Step>('email')
  const [loading, setLoading] = useState(false)
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (!showSubscriberCount) return
    fetch('/api/stats/subscribers/count')
      .then((res) => res.json())
      .then((data) => setSubscriberCount(data.count ?? null))
      .catch(() => {})
  }, [showSubscriberCount])

  const resolvedHeaderText =
    headerText ??
    (subscriberCount && subscriberCount > 0
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

      setLoading(true)
      try {
        const res = await fetch('/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            source: getExternalReferrer(),
            newsletters,
            ...(allowExistingSubscriberOptIn
              ? { allowExistingSubscriberOptIn: true }
              : {}),
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
    [allowExistingSubscriberOptIn, email, newsletters]
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
          body: JSON.stringify({ email, code: value }),
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
    [email]
  )

  const initialMemberClassName =
    hideWhenLoggedIn && hasSession === null ? '[[data-member]_&]:hidden' : ''
  const rootClassName = `${initialMemberClassName} ${className ?? ''}`

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

  if (step === 'code') {
    return (
      <div
        className={`flex flex-col ${
          align === 'center' ? 'items-center text-center' : 'items-start'
        } ${rootClassName}`}
      >
        <p className="font-sans text-sm font-semibold text-gray-800">
          Check your email
        </p>
        <p className="mt-1 max-w-md font-serif text-sm leading-relaxed text-gray-600">
          Enter the 6-digit code sent to{' '}
          <span className="font-sans text-gray-800">{email}</span>.
        </p>
        <div
          className={`mt-4 flex flex-col ${
            align === 'center' ? 'items-center' : 'items-start'
          }`}
        >
          <InputOTP
            maxLength={6}
            value={code}
            onChange={setCode}
            onComplete={verifyCode}
            disabled={loading}
            autoFocus
            aria-label="6-digit code"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          {loading ? (
            <div className="mt-3 flex items-center gap-2">
              <Spinner className="h-3 w-3 text-gray-500" />
              <p className="text-xs text-gray-500 font-sans">Verifying</p>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={handleDifferentEmail}
              className="text-xs text-gray-500 underline underline-offset-2 decoration-gray-300 hover:text-gray-700 cursor-pointer transition-colors font-sans"
            >
              Use a different email
            </button>
            <GoogleSignInLink />
          </div>
        </div>
      </div>
    )
  }

  return (
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
  )
}
