'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuthContext } from '@/components/auth/auth-provider'
import {
  GoogleSignInButton,
  type GoogleSignInResult,
  useGoogleSignInAvailable,
} from '@/components/auth/google-sign-in'
import { ArrowIcon } from '@/components/ui/arrow-icon'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import { Spinner } from '@/components/ui/spinner'
import type { Newsletter } from '@/lib/content/types'
import { formatMemberCount } from '@/lib/format-member-count'
import {
  defaultSignupNewsletters,
  newsletterPreferenceKeys,
} from '@/lib/newsletters'
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
  /**
   * When true and no initial count was provided, fetches the live subscriber
   * count client-side and uses it as the header text ("Join N other subscribers:").
   */
  showSubscriberCount?: boolean
}

type Step = 'email' | 'code' | 'confirmed'

function matchesSubmittedEmail(
  sessionEmail: unknown,
  submittedEmail: string
): boolean {
  return (
    typeof sessionEmail === 'string' &&
    sessionEmail.trim().toLowerCase() === submittedEmail.trim().toLowerCase()
  )
}

function hasRequestedNewsletterOptIns(
  preferences: unknown,
  newsletters: readonly Newsletter[]
): boolean {
  if (newsletters.length === 0) return true
  if (!preferences || typeof preferences !== 'object') return false
  const values = preferences as Record<string, unknown>
  return newsletters.every(
    (newsletter) => values[newsletterPreferenceKeys[newsletter]] === true
  )
}

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

      setLoading(true)
      try {
        const res = await fetch(subscribeEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            source: getExternalReferrer(),
            newsletters,
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
    [email, newsletters, subscribeEndpoint]
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
          body: JSON.stringify({ email, code: value, newsletters }),
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
    [email, newsletters]
  )

  const initialMemberClassName =
    hideWhenLoggedIn && hasSession === null ? '[[data-member]_&]:hidden' : ''
  const rootClassName = `${initialMemberClassName} ${className ?? ''}`

  const finishSignedIn = useCallback(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('signed-in', '1')
    window.location.assign(url.toString())
  }, [])

  useEffect(() => {
    if (step !== 'code') return

    let cancelled = false

    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (
          !cancelled &&
          matchesSubmittedEmail(data.user?.email, email) &&
          hasRequestedNewsletterOptIns(data.preferences, newsletters)
        ) {
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
  }, [email, newsletters, step, finishSignedIn])

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

      {step === 'code' ? (
        <SignupConfirmationDialog
          code={code}
          email={email}
          loading={loading}
          newsletters={newsletters}
          onCodeChange={setCode}
          onDifferentEmail={handleDifferentEmail}
          onSignedIn={finishSignedIn}
          onVerifyCode={verifyCode}
        />
      ) : null}
    </>
  )
}

function SignupConfirmationDialog({
  code,
  email,
  loading,
  newsletters,
  onCodeChange,
  onDifferentEmail,
  onSignedIn,
  onVerifyCode,
}: {
  code: string
  email: string
  loading: boolean
  newsletters: readonly Newsletter[]
  onCodeChange: (value: string) => void
  onDifferentEmail: () => void
  onSignedIn: () => void
  onVerifyCode: (value: string) => void
}) {
  const googleAvailable = useGoogleSignInAvailable()
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onDifferentEmail()
    },
    [onDifferentEmail]
  )
  const handleGoogleSuccess = useCallback(
    (result: GoogleSignInResult) => {
      if (!matchesSubmittedEmail(result.user?.email, email)) {
        toast.error(`Use the Google account for ${email}.`)
        return false
      }
      if (!hasRequestedNewsletterOptIns(result.user, newsletters)) {
        toast.error('Check your email for the code to finish subscribing.')
        return false
      }
      onSignedIn()
    },
    [email, newsletters, onSignedIn]
  )

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Check your email</DialogTitle>
          <DialogDescription>
            {googleAvailable
              ? `Check ${email} for a 6-digit code, or finish with Google.`
              : `Check ${email} for a 6-digit code.`}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-6 space-y-4">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={onCodeChange}
            onComplete={onVerifyCode}
            disabled={loading}
            autoFocus
            aria-label="6-digit code"
            containerClassName="justify-center"
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
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <Spinner className="h-3.5 w-3.5" />
              <span>Verifying</span>
            </div>
          ) : null}
          {googleAvailable ? (
            <>
              <p className="text-center font-sans text-xs text-gray-400">or</p>
              <GoogleSignInButton
                onSuccess={handleGoogleSuccess}
                requestContext={{ expectedEmail: email, newsletters }}
              />
            </>
          ) : null}
          <button
            type="button"
            onClick={onDifferentEmail}
            className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Use a different email
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
