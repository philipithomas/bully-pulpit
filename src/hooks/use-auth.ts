'use client'

import { useCallback, useEffect, useState } from 'react'
import type { SubscriberPreferences } from '@/lib/auth/preferences'

export interface AuthUser {
  uuid: string
  email: string
  name: string | null
  isAdmin: boolean
}

function hasSessionCookie(): boolean {
  return document.cookie
    .split(';')
    .some((c) => c.trim().startsWith('bp_has_session='))
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [preferences, setPreferences] = useState<SubscriberPreferences | null>(
    null
  )
  // null until the cookie is read on the client. The header renders both
  // presentations while null and lets the pre-paint session hint script in
  // the root layout pick the visible one, so first paint is correct for
  // both anonymous visitors and returning members.
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [showNewSubscriberOnboarding, setShowNewSubscriberOnboarding] =
    useState(false)

  useEffect(() => {
    const present = hasSessionCookie()
    setHasSession(present)
    if (!present) {
      setShowNewSubscriberOnboarding(false)
      setLoading(false)
      return
    }

    fetch('/api/auth/me?consume_onboarding=1')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load session')
        return res.json()
      })
      .then(
        (data: {
          user: AuthUser | null
          preferences?: SubscriberPreferences | null
          newSubscriberOnboarding?: boolean
        }) => {
          const nextUser = data.user ?? null
          setUser(nextUser)
          setPreferences(nextUser ? (data.preferences ?? null) : null)
          setShowNewSubscriberOnboarding(
            Boolean(nextUser && data.newSubscriberOnboarding)
          )
          if (!nextUser) setHasSession(false)
        }
      )
      .catch(() => {
        setUser(null)
        setPreferences(null)
        setShowNewSubscriberOnboarding(false)
        setHasSession(false)
      })
      .finally(() => setLoading(false))
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    // biome-ignore lint/suspicious/noDocumentCookie: clearing session indicator
    document.cookie = 'bp_has_session=; path=/; max-age=0'
    setUser(null)
    setPreferences(null)
    setShowNewSubscriberOnboarding(false)
    setHasSession(false)
    document.documentElement.removeAttribute('data-member')
  }, [])

  const dismissNewSubscriberOnboarding = useCallback(() => {
    setShowNewSubscriberOnboarding(false)
  }, [])

  return {
    user,
    preferences,
    setPreferences,
    hasSession,
    loading,
    logout,
    showNewSubscriberOnboarding,
    dismissNewSubscriberOnboarding,
  }
}
