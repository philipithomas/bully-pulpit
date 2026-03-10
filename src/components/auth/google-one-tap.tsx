'use client'

import Script from 'next/script'
import { useCallback, useEffect, useRef } from 'react'
import { useAuthContext } from '@/components/auth/auth-provider'
import { siteConfig } from '@/lib/config'

declare global {
  interface Window {
    __initGoogleOneTap?: () => void
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential: string }) => void
            auto_select?: boolean
          }) => void
          prompt: () => void
        }
      }
    }
  }
}

export function GoogleOneTap() {
  const { user, loading } = useAuthContext()
  const initializedRef = useRef(false)

  const handleCredential = useCallback(
    async (response: { credential: string }) => {
      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: response.credential }),
        })

        if (res.ok) {
          window.location.reload()
        }
      } catch {
        // Silently fail — user can still use email sign-in
      }
    },
    []
  )

  useEffect(() => {
    if (loading || user || initializedRef.current) return
    if (!siteConfig.googleClientId) return

    const initOneTap = () => {
      if (!window.google || initializedRef.current) return
      initializedRef.current = true

      window.google.accounts.id.initialize({
        client_id: siteConfig.googleClientId,
        callback: handleCredential,
        auto_select: true,
      })
      window.google.accounts.id.prompt()
    }

    if (window.google) {
      initOneTap()
    }

    window.__initGoogleOneTap = initOneTap
  }, [loading, user, handleCredential])

  if (!siteConfig.googleClientId) return null

  return (
    <Script
      src="https://accounts.google.com/gsi/client"
      strategy="lazyOnload"
      onReady={() => {
        window.__initGoogleOneTap?.()
      }}
    />
  )
}
