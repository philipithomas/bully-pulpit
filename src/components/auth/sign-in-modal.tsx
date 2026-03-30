'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { GoogleSignInButton } from '@/components/auth/google-sign-in'
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
import { getExternalReferrer } from '@/lib/referrer'
import { useAuthModal } from '@/stores/auth-store'

type Step = 'email' | 'code'

export function SignInModal({ onSuccess }: { onSuccess?: () => void }) {
  const { open, closeModal } = useAuthModal()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const submittingRef = useRef(false)

  const reset = useCallback(() => {
    setStep('email')
    setEmail('')
    setCode('')
    setLoading(false)
  }, [])

  function handleClose(isOpen: boolean) {
    if (!isOpen) {
      closeModal()
      setTimeout(reset, 200)
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: getExternalReferrer() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Something went wrong')
      }

      setStep('code')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
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
          throw new Error(data.error ?? 'Verification failed')
        }

        closeModal()
        onSuccess?.()
        window.location.assign(`${window.location.pathname}?signed-in=1`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
        setCode('')
      } finally {
        setLoading(false)
        submittingRef.current = false
      }
    },
    [email, closeModal, onSuccess]
  )

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        {step === 'email' ? (
          <>
            <DialogHeader>
              <DialogTitle>Sign in or join</DialogTitle>
              <DialogDescription>
                Enter your email to sign in or create an account.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-6 space-y-4">
              <GoogleSignInButton onSuccess={onSuccess} />
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-400 font-sans uppercase tracking-wide">
                  or
                </span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  aria-label="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="w-full border border-gray-300 bg-white px-4 py-3 text-sm font-sans text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-0"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gray-950 text-white py-3 text-sm font-semibold tracking-wide uppercase hover:bg-gray-800 transition-colors disabled:opacity-70"
                >
                  {loading ? (
                    <Spinner className="h-4 w-4 mx-auto" />
                  ) : (
                    'Continue with email'
                  )}
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Check your email</DialogTitle>
              <DialogDescription>
                Check {email} for a 6-digit code.
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
              <button
                type="button"
                onClick={() => {
                  setStep('email')
                  setCode('')
                }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Use a different email
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
