'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useAuthContext } from '@/components/auth/auth-provider'
import { InlineSignupForm } from '@/components/auth/inline-signup-form'
import { Spinner } from '@/components/ui/spinner'
import { siteConfig } from '@/lib/config'
import type { Newsletter } from '@/lib/content/types'
import { newsletterPreferenceKeys } from '@/lib/newsletters'

// What a subscriber receives, per newsletter: Contraption sends essays,
// Workshop sends work in progress notes, Postcard sends monthly updates.
const newsletterNoun: Record<Newsletter, string> = {
  contraption: 'essays',
  workshop: 'notes',
  postcard: 'updates',
  tsundoku: 'photos',
}

export function SubscribeCta({
  newsletter,
  className = 'mt-16',
  align = 'start',
  subscribeEndpoint,
}: {
  newsletter: Newsletter
  className?: string
  align?: 'start' | 'center'
  subscribeEndpoint?: string
}) {
  const { user, preferences, setPreferences, hasSession, loading } =
    useAuthContext()
  const [saving, setSaving] = useState(false)
  const key = newsletterPreferenceKeys[newsletter]
  const config = siteConfig.newsletters[newsletter]
  const buttonClassName =
    newsletter === 'tsundoku' ? 'btn btn-sun' : 'btn btn-primary'
  const subscribed = preferences ? Boolean(preferences[key]) : false
  const initialMemberClassName =
    hasSession === null ? '[[data-member]_&]:hidden' : ''

  const subscribeSignedIn = useCallback(async () => {
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
      const data = await res.json().catch(() => null)
      setPreferences(
        (prev) => data?.preferences ?? (prev ? { ...prev, [key]: true } : prev)
      )
      toast.success(`Subscribed to ${config.name}`)
    } catch {
      toast.error('Could not subscribe. Try again.')
    } finally {
      setSaving(false)
    }
  }, [config.name, key, setPreferences])

  if (hasSession && loading) return null
  if (user && (!preferences || subscribed)) return null

  return (
    <div
      className={`mx-auto w-full max-w-2xl ${initialMemberClassName} ${className}`}
    >
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
          confirmedMessage={`You are subscribed to new ${newsletterNoun[newsletter]} by email.`}
          newsletters={[newsletter]}
          subscribeEndpoint={subscribeEndpoint}
        />
      )}
    </div>
  )
}
