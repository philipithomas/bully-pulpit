'use client'

import { useState } from 'react'
import { ArrowIcon } from '@/components/ui/arrow-icon'

export function InlineSignupForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return

    setStatus('loading')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
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

  if (status === 'success') {
    return (
      <p className="text-forest text-sm font-sans">
        Check your inbox for a confirmation link.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-start">
      <div className="flex items-center w-full sm:w-2/3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email"
          aria-label="Email address"
          required
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
