'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuthModal } from '@/stores/auth-store'

type Step = 'email' | 'code'

export function SignInModal({ onSuccess }: { onSuccess?: () => void }) {
  const { open, closeModal } = useAuthModal()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)

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
        body: JSON.stringify({ email }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Something went wrong')
      }

      setStep('code')
      setTimeout(() => codeInputRef.current?.focus(), 100)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Verification failed')
      }

      closeModal()
      toast.success('Signed in successfully')
      onSuccess?.()
      window.location.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

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
            <form onSubmit={handleEmailSubmit} className="mt-6 space-y-4">
              <input
                type="email"
                name="email"
                autoComplete="email"
                aria-label="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoFocus
                className="w-full border border-gray-300 bg-white px-4 py-3 text-sm font-sans text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-0"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gray-950 text-white py-3 text-sm font-semibold tracking-wide uppercase hover:bg-gray-800 transition-colors disabled:opacity-70"
              >
                {loading ? 'Sending...' : 'Continue'}
              </button>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Check your email</DialogTitle>
              <DialogDescription>
                A 6-digit code was sent to {email}.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCodeSubmit} className="mt-6 space-y-4">
              <input
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                required
                className="w-full border border-gray-300 bg-white px-4 py-3 text-center text-2xl font-mono tracking-[0.3em] text-gray-900 placeholder:text-gray-300 focus:border-gray-900 focus:outline-none focus:ring-0"
              />
              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="w-full bg-gray-950 text-white py-3 text-sm font-semibold tracking-wide uppercase hover:bg-gray-800 transition-colors disabled:opacity-70"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>
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
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
