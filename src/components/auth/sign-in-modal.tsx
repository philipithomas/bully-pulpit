'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { EmailCodeConfirmationDialog } from '@/components/auth/email-code-confirmation-dialog'
import {
  GoogleSignInButton,
  useGoogleSignInAvailable,
} from '@/components/auth/google-sign-in'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { trackClientEvent } from '@/lib/analytics/events'
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

  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        closeModal()
        setTimeout(reset, 200)
      }
    },
    [closeModal, reset]
  )
  const handleDifferentEmail = useCallback(() => {
    setStep('email')
    setCode('')
  }, [])
  const handleCodeDialogClose = useCallback(
    () => handleClose(false),
    [handleClose]
  )
  const handleEmailChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setEmail(event.currentTarget.value),
    []
  )

  const handleEmailSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      trackClientEvent('Newsletter signup submitted', {
        method: 'email',
        placement: 'sign_in_modal',
        newsletter: 'unspecified',
        signed_in: false,
      })
      setLoading(true)

      try {
        const res = await fetch('/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            source: getExternalReferrer(),
            analytics_placement: 'sign_in_modal',
          }),
        })

        if (!res.ok) {
          const data = await res.json()
          toast.error(data.error ?? 'Could not sign in. Try again.')
          return
        }

        setStep('code')
      } catch {
        toast.error('Could not sign in. Try again.')
      } finally {
        setLoading(false)
      }
    },
    [email]
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
            analytics_placement: 'sign_in_modal',
          }),
        })

        if (!res.ok) {
          const data = await res.json()
          toast.error(data.error ?? 'That code did not work. Try again.')
          setCode('')
          return
        }

        closeModal()
        onSuccess?.()
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
    [email, closeModal, onSuccess]
  )

  if (step === 'code') {
    return (
      <EmailCodeConfirmationDialog
        open={open}
        code={code}
        email={email}
        loading={loading}
        onCodeChange={setCode}
        onClose={handleCodeDialogClose}
        onDifferentEmail={handleDifferentEmail}
        onVerifyCode={verifyCode}
      />
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign in or join</DialogTitle>
          <DialogDescription>
            Enter your email to sign in or create an account.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-6 space-y-4">
          <GoogleSignInSection onSuccess={onSuccess} />
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <input
              type="email"
              name="email"
              autoComplete="email"
              aria-label="Email address"
              value={email}
              onChange={handleEmailChange}
              placeholder="your@email.com"
              required
              className="w-full border border-gray-300 bg-white px-4 py-3 text-sm pointer-coarse:text-base font-sans text-gray-900 placeholder:text-gray-400"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-950 text-white py-3 text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Spinner className="h-4 w-4 mx-auto" />
              ) : (
                'Continue with email'
              )}
            </button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Button + "or" separator hide together when the GSI script is blocked,
// leaving the email form as the only option.
function GoogleSignInSection({ onSuccess }: { onSuccess?: () => void }) {
  const available = useGoogleSignInAvailable()

  if (!available) return null

  return (
    <>
      <GoogleSignInButton
        analyticsPlacement="sign_in_modal"
        onSuccess={onSuccess}
      />
      <p className="text-center font-sans text-xs text-gray-400">or</p>
    </>
  )
}
