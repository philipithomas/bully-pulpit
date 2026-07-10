'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  LOGOUT_FAILURE_MESSAGE,
  logoutAndClearClientSession,
} from '@/lib/auth/client-logout'
import type { SubscriberPreferences } from '@/lib/auth/preferences'

const SESSION_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000] as const

export interface AuthUser {
  uuid: string
  email: string
  name: string | null
  isAdmin: boolean
}

function hasSessionCookie(): boolean {
  return document.cookie.split(';').some((c) => {
    const cookie = c.trim()
    return (
      cookie.startsWith('__Host-bp_has_session=') ||
      cookie.startsWith('bp_has_session=')
    )
  })
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

    let cancelled = false
    let retryAttempt = 0
    let retryTimer: number | null = null

    const scheduleRetry = () => {
      if (cancelled) return
      // A failed lookup is unresolved auth, not a confirmed anonymous session.
      // Keep the cookie-backed member presentation in place while retrying.
      setHasSession(true)
      setLoading(true)
      const delay =
        SESSION_RETRY_DELAYS_MS[
          Math.min(retryAttempt, SESSION_RETRY_DELAYS_MS.length - 1)
        ]
      retryAttempt += 1
      retryTimer = window.setTimeout(() => {
        retryTimer = null
        void loadSession()
      }, delay)
    }

    const loadSession = async () => {
      try {
        const response = await fetch('/api/auth/me?consume_onboarding=1')
        if (!response.ok) {
          scheduleRetry()
          return
        }
        const data = (await response.json()) as {
          user: AuthUser | null
          preferences?: SubscriberPreferences | null
          newSubscriberOnboarding?: boolean
        }
        if (cancelled) return

        const nextUser = data.user ?? null
        setUser(nextUser)
        setPreferences(nextUser ? (data.preferences ?? null) : null)
        setShowNewSubscriberOnboarding(
          Boolean(nextUser && data.newSubscriberOnboarding)
        )
        // A successful anonymous payload is authoritative invalid/missing
        // session state. It remains the only fetch outcome that removes the
        // cookie-backed client session hint.
        setHasSession(Boolean(nextUser))
        setLoading(false)
      } catch {
        scheduleRetry()
      }
    }

    void loadSession()
    return () => {
      cancelled = true
      if (retryTimer !== null) window.clearTimeout(retryTimer)
    }
  }, [])

  const logout = useCallback(async (): Promise<boolean> => {
    try {
      await logoutAndClearClientSession(() => {
        // biome-ignore lint/suspicious/noDocumentCookie: clearing session indicator
        document.cookie = '__Host-bp_has_session=; path=/; max-age=0; Secure'
        // Remove the pre-migration indicator if it still exists.
        // biome-ignore lint/suspicious/noDocumentCookie: migration cleanup
        document.cookie = 'bp_has_session=; path=/; max-age=0'
        setUser(null)
        setPreferences(null)
        setShowNewSubscriberOnboarding(false)
        setHasSession(false)
        document.documentElement.removeAttribute('data-member')
      })
      return true
    } catch {
      toast.error(LOGOUT_FAILURE_MESSAGE)
      return false
    }
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
