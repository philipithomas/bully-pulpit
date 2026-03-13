'use client'

import { useState } from 'react'
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

export function InlineSignupForm({
  showNewsletterPicker = false,
  hideWhenLoggedIn = false,
  autoFocus = false,
  className,
}: Props) {
  const { user, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [selected, setSelected] = useState<Set<string>>(
    new Set(['contraption', 'workshop', 'postcard'])
  )
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [errorMsg, setErrorMsg] = useState('')

  function toggleNewsletter(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    if (showNewsletterPicker && selected.size === 0) return

    setStatus('loading')
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
        setStatus('error')
        return
      }
      setStatus('success')
      setEmail('')
    } catch {
      setErrorMsg('Unable to reach subscription service')
      setStatus('error')
    }
  }

  if (hideWhenLoggedIn && (loading || user)) return null

  if (status === 'success') {
    return (
      <div className={className}>
        <p className="text-forest text-sm font-sans">
          Check your inbox for a confirmation link.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
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
          disabled={status === 'loading'}
          className="btn btn-primary h-10 shrink-0"
        >
          <span className="btn-text">
            {status === 'loading' ? '...' : 'Subscribe'}
          </span>
          <span className="btn-arrow">
            <ArrowIcon className="w-4 h-4" />
          </span>
        </button>
      </div>
      {status === 'error' && (
        <p className="text-red text-xs mt-2 font-sans">{errorMsg}</p>
      )}
    </form>
  )
}
