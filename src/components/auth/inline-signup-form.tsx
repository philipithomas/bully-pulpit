'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuthContext } from '@/components/auth/auth-provider'
import { ArrowIcon } from '@/components/ui/arrow-icon'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import { Spinner } from '@/components/ui/spinner'
import { getExternalReferrer } from '@/lib/referrer'

interface Props {
  showNewsletterPicker?: boolean
  hideWhenLoggedIn?: boolean
  autoFocus?: boolean
  className?: string
  headerText?: string
}

const newsletters = [
  { id: 'contraption', label: 'Contraption', desc: 'Essays and projects.' },
  {
    id: 'workshop',
    label: 'Workshop',
    desc: 'Journal about work in progress.',
  },
  { id: 'postcard', label: 'Postcard', desc: "What I'm up to." },
] as const

type Step = 'email' | 'code'

export function InlineSignupForm({
  showNewsletterPicker = false,
  hideWhenLoggedIn = false,
  autoFocus = false,
  className,
  headerText,
}: Props) {
  const { user, loading: authLoading } = useAuthContext()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [selected, setSelected] = useState<Set<string>>(
    new Set(['contraption', 'workshop', 'postcard'])
  )
  const [step, setStep] = useState<Step>('email')
  const [loading, setLoading] = useState(false)
  const submittingRef = useRef(false)

  function toggleNewsletter(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    if (showNewsletterPicker && selected.size === 0) return

    setLoading(true)
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source: getExternalReferrer(),
          newsletters: showNewsletterPicker
            ? Array.from(selected)
            : ['contraption', 'workshop', 'postcard'],
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Subscription failed')
        return
      }
      setStep('code')
    } catch {
      toast.error('Unable to reach subscription service')
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
          toast.error(data.error ?? 'Verification failed')
          setCode('')
          return
        }
        window.location.assign(`${window.location.pathname}?signed-in=1`)
      } catch {
        toast.error('Unable to verify code')
        setCode('')
      } finally {
        setLoading(false)
        submittingRef.current = false
      }
    },
    [email]
  )

  if (hideWhenLoggedIn && (authLoading || user)) return null

  if (step === 'code') {
    return (
      <div className={className}>
        <p className="font-serif text-sm text-gray-600 mb-3">
          Check {email} for a 6-digit code.
        </p>
        <div className="flex flex-col items-start">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={setCode}
            onComplete={verifyCode}
            disabled={loading}
            autoFocus
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
            <div className="flex items-center gap-2 mt-2">
              <Spinner className="h-3 w-3 text-gray-500" />
              <p className="text-xs text-gray-500 font-sans">Verifying</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setStep('email')
              setCode('')
            }}
            className="text-xs text-gray-500 underline underline-offset-2 decoration-gray-300 hover:text-gray-700 cursor-pointer transition-colors mt-2 font-sans"
          >
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleEmailSubmit}
      className={`flex flex-col items-start ${className ?? ''}`}
    >
      {headerText && (
        <p className="font-sans text-lg font-medium mb-3 text-gray-800">
          {headerText}
        </p>
      )}
      {showNewsletterPicker && (
        <fieldset className="mb-5 space-y-3">
          {newsletters.map((nl) => (
            <label
              key={nl.id}
              className="flex items-start gap-3 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={selected.has(nl.id)}
                onChange={() => toggleNewsletter(nl.id)}
                className="mt-1 h-4 w-4 accent-gray-950 shrink-0"
              />
              <span>
                <span className="font-sans text-sm font-semibold text-gray-900">
                  {nl.label}
                </span>
                <span className="font-serif text-sm text-gray-500 ml-2">
                  {nl.desc}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
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
          className="border border-gray-300 bg-white px-3 py-2 flex-grow w-full focus:outline-none focus:ring-0 focus:border-gray-900 text-sm h-10 font-sans"
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
  )
}
