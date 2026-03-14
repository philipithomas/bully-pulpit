'use client'

import { useRef, useState } from 'react'
import { ArrowIcon } from '@/components/ui/arrow-icon'
import { useAuth } from '@/hooks/use-auth'

interface Props {
  showNewsletterPicker?: boolean
  hideWhenLoggedIn?: boolean
  autoFocus?: boolean
  className?: string
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

type Step = 'email' | 'code' | 'done'

export function InlineSignupForm({
  showNewsletterPicker = false,
  hideWhenLoggedIn = false,
  autoFocus = false,
  className,
}: Props) {
  const { user, loading: authLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [selected, setSelected] = useState<Set<string>>(
    new Set(['contraption', 'workshop', 'postcard'])
  )
  const [step, setStep] = useState<Step>('email')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const codeInputRef = useRef<HTMLInputElement>(null)

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
    setErrorMsg('')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          newsletters: showNewsletterPicker
            ? Array.from(selected)
            : ['contraption', 'workshop', 'postcard'],
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setErrorMsg(data.error ?? 'Subscription failed')
        return
      }
      setStep('code')
      setTimeout(() => codeInputRef.current?.focus(), 100)
    } catch {
      setErrorMsg('Unable to reach subscription service')
    } finally {
      setLoading(false)
    }
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      if (!res.ok) {
        const data = await res.json()
        setErrorMsg(data.error ?? 'Verification failed')
        return
      }
      setStep('done')
      window.location.reload()
    } catch {
      setErrorMsg('Unable to verify code')
    } finally {
      setLoading(false)
    }
  }

  if (hideWhenLoggedIn && (authLoading || user)) return null

  if (step === 'done') {
    return (
      <div className={className}>
        <p className="text-forest text-sm font-sans">Signed in successfully.</p>
      </div>
    )
  }

  if (step === 'code') {
    return (
      <div className={className}>
        <p className="font-serif text-sm text-gray-600 mb-3">
          A 6-digit code was sent to {email}.
        </p>
        <form onSubmit={handleCodeSubmit} className="flex flex-col items-start">
          <div className="flex items-center w-full sm:w-2/3">
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
              className="border border-gray-300 bg-white px-3 py-2 flex-grow w-full focus:outline-none focus:ring-0 focus:border-gray-900 text-center text-lg font-mono tracking-[0.3em] h-10"
            />
            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="btn btn-primary h-10 shrink-0"
            >
              <span className="btn-text">{loading ? '...' : 'Verify'}</span>
              <span className="btn-arrow">
                <ArrowIcon className="w-4 h-4" />
              </span>
            </button>
          </div>
          {errorMsg && (
            <p className="text-red text-xs mt-2 font-sans">{errorMsg}</p>
          )}
          <button
            type="button"
            onClick={() => {
              setStep('email')
              setCode('')
              setErrorMsg('')
            }}
            className="text-xs text-gray-500 underline underline-offset-2 decoration-gray-300 hover:text-gray-700 cursor-pointer transition-colors mt-2 font-sans"
          >
            Use a different email
          </button>
        </form>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleEmailSubmit}
      className={`flex flex-col items-start ${className ?? ''}`}
    >
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
          <span className="btn-text">{loading ? '...' : 'Subscribe'}</span>
          <span className="btn-arrow">
            <ArrowIcon className="w-4 h-4" />
          </span>
        </button>
      </div>
      {errorMsg && (
        <p className="text-red text-xs mt-2 font-sans">{errorMsg}</p>
      )}
    </form>
  )
}
