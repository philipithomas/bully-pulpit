'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuthContext } from '@/components/auth/auth-provider'
import { InlineSignupForm } from '@/components/auth/inline-signup-form'
import { Spinner } from '@/components/ui/spinner'
import { siteConfig } from '@/lib/config'
import type { Newsletter } from '@/lib/content/types'

// What a subscriber receives, per newsletter: Contraption sends essays,
// Workshop sends work in progress notes, Postcard sends monthly updates.
const newsletterNoun: Record<Newsletter, string> = {
  contraption: 'essays',
  workshop: 'notes',
  postcard: 'updates',
  tsundoku: 'photos',
}

const preferenceKeys: Record<Newsletter, string> = {
  contraption: 'subscribed_contraption',
  workshop: 'subscribed_workshop',
  postcard: 'subscribed_postcard',
  tsundoku: 'subscribed_tsundoku',
}

type Preferences = Record<(typeof preferenceKeys)[Newsletter], boolean>

export function SubscribeCta({
  newsletter,
  className = 'mt-16',
  align = 'start',
}: {
  newsletter: Newsletter
  className?: string
  align?: 'start' | 'center'
}) {
  const { user } = useAuthContext()
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [saving, setSaving] = useState(false)
  const key = preferenceKeys[newsletter]
  const config = siteConfig.newsletters[newsletter]
  const buttonClassName =
    newsletter === 'tsundoku' ? 'btn btn-sun' : 'btn btn-primary'

  useEffect(() => {
    if (!user) {
      setPrefs(null)
      return
    }
    let cancelled = false
    fetch('/api/auth/preferences')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load preferences')
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setPrefs(data)
      })
      .catch(() => {
        if (!cancelled) setPrefs(null)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const subscribed = useMemo(
    () => (prefs ? Boolean(prefs[key]) : false),
    [prefs, key]
  )

  async function subscribeSignedIn() {
    setSaving(true)
    try {
      const res = await fetch('/api/auth/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: true }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error ?? 'Could not subscribe. Try again.')
        return
      }
      setPrefs((prev) => (prev ? { ...prev, [key]: true } : prev))
      toast.success(`Subscribed to ${config.name}`)
    } catch {
      toast.error('Could not subscribe. Try again.')
    } finally {
      setSaving(false)
    }
  }

  // No loading gate: the CTA must be in the static HTML for logged-out
  // visitors; signed-in members get a brief flash before it collapses.
  if (user && subscribed) return null

  return (
    <div className={`mx-auto w-full max-w-2xl ${className}`}>
      <p className="font-serif text-gray-600 text-lg mb-5">
        Get new {newsletterNoun[newsletter]} by email:
      </p>
      {user ? (
        <button
          type="button"
          onClick={subscribeSignedIn}
          disabled={saving}
          className={buttonClassName}
        >
          <span className="btn-text">
            {saving ? (
              <Spinner className="h-4 w-4" />
            ) : (
              `Subscribe to ${config.name}`
            )}
          </span>
        </button>
      ) : (
        <InlineSignupForm
          align={align}
          buttonClassName={buttonClassName}
          newsletters={[newsletter]}
        />
      )}
    </div>
  )
}
