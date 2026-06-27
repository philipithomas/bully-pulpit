'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuthContext } from '@/components/auth/auth-provider'
import {
  GoogleSignInButton,
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
import { formatMemberCount } from '@/lib/format-member-count'
import { getExternalReferrer } from '@/lib/referrer'

interface Props {
  hideWhenLoggedIn?: boolean
  autoFocus?: boolean
  className?: string
  headerText?: string
  /**
   * When true, fetches the live subscriber count client-side and uses it as the
   * header text ("Join N other subscribers:"). Lets the host page stay static.
   */
  showSubscriberCount?: boolean
}

type Step = 'email' | 'code'

export function InlineSignupForm({
  hideWhenLoggedIn = false,
  autoFocus = false,
  className,
  headerText,
  showSubscriberCount = false,
}: Props) {
  const { user } = useAuthContext()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<Step>('email')
  const [loading, setLoading] = useState(false)
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null)
  const submittingRef = useRef(false)
  const googleAvailable = useGoogleSignInAvailable()

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

  async function handleEmailSubmit(e: React.FormEvent) {
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
          newsletters: ['contraption', 'workshop', 'postcard'],
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Could not subscribe. Try again.')
        return
      }
      setStep('code')
    } catch {
      toast.error('Could not subscribe. Try again.')
    } finally {
      setLoading(false)
    }
  }

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
        if (!cancelled && data.user) {
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
  }, [step, finishSignedIn])

  // No authLoading gate: the form must be in the static HTML for logged-out
  // visitors; signed-in members get a brief flash before it collapses.
  if (hideWhenLoggedIn && user) return null

  const resetCodeStep = () => {
    setStep('email')
    setCode('')
  }

  return (
    <>
      <form
        onSubmit={handleEmailSubmit}
        className={`flex flex-col items-start ${className ?? ''}`}
      >
        {resolvedHeaderText && (
          <p className="font-sans text-lg font-medium mb-3 text-gray-800">
            {resolvedHeaderText}
          </p>
        )}
        <div className="flex items-center w-full sm:w-2/3">
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email"
            aria-label="Email address"
            required
            autoFocus={autoFocus}
            className="border border-gray-300 bg-white px-3 py-2 flex-grow w-full text-sm pointer-coarse:text-base h-10 font-sans"
          />
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary h-10 shrink-0"
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

      <Dialog
        open={step === 'code'}
        onOpenChange={(open) => {
          if (!open) resetCodeStep()
        }}
      >
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
              onChange={setCode}
              onComplete={verifyCode}
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
            {loading && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <Spinner className="h-3.5 w-3.5" />
                <span>Verifying</span>
              </div>
            )}
            {googleAvailable && (
              <>
                <p className="text-center font-sans text-xs text-gray-400">
                  or
                </p>
                <GoogleSignInButton onSuccess={finishSignedIn} />
              </>
            )}
            <button
              type="button"
              onClick={resetCodeStep}
              className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Use a different email
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
