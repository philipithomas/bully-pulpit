'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Spinner } from '@/components/ui/spinner'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''

interface GoogleCodeResponse {
  code: string
  error?: string
}

interface GoogleErrorResponse {
  type: string
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (config: {
            client_id: string
            scope: string
            ux_mode: 'popup' | 'redirect'
            callback: (response: GoogleCodeResponse) => void
            error_callback?: (error: GoogleErrorResponse) => void
          }) => {
            requestCode: () => void
          }
        }
      }
    }
  }
}

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve()
      return
    }
    const existing = document.querySelector(
      'script[src*="accounts.google.com/gsi/client"]'
    ) as HTMLScriptElement | null
    if (existing) {
      if (window.google?.accounts?.oauth2) {
        resolve()
      } else {
        existing.addEventListener('load', () => resolve())
      }
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'))
    document.head.appendChild(script)
  })
}

function useGoogleAuth(onSuccess?: () => void) {
  const [loading, setLoading] = useState(false)
  const clientRef = useRef<{ requestCode: () => void } | null>(null)
  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return

    let cancelled = false

    loadGoogleScript().then(() => {
      if (cancelled) return

      clientRef.current = window.google!.accounts.oauth2.initCodeClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'openid email profile',
        ux_mode: 'popup',
        callback: async (response: GoogleCodeResponse) => {
          if (response.error) {
            setLoading(false)
            return
          }
          try {
            const res = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: response.code }),
            })
            if (!res.ok) {
              const data = await res.json()
              throw new Error(data.error ?? 'Google sign-in failed')
            }
            toast.success('Signed in successfully')
            onSuccessRef.current?.()
            window.location.reload()
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : 'Google sign-in failed'
            )
          } finally {
            setLoading(false)
          }
        },
        error_callback: (error: GoogleErrorResponse) => {
          if (error.type === 'popup_failed_to_open') {
            toast.error('Could not open sign-in window. Please allow popups.')
          }
          setLoading(false)
        },
      })
    })

    return () => {
      cancelled = true
      clientRef.current = null
    }
  }, [])

  const requestSignIn = useCallback(() => {
    if (loading || !clientRef.current) return
    setLoading(true)
    clientRef.current.requestCode()
  }, [loading])

  return { requestSignIn, loading }
}

export function GoogleSignInButton({ onSuccess }: { onSuccess?: () => void }) {
  const { requestSignIn, loading } = useGoogleAuth(onSuccess)

  if (!GOOGLE_CLIENT_ID) return null

  return (
    <button
      type="button"
      onClick={requestSignIn}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-70 cursor-pointer"
    >
      {loading ? (
        <Spinner className="h-5 w-5" />
      ) : (
        <>
          <GoogleLogo className="h-5 w-5 shrink-0" />
          <span>Sign in with Google</span>
        </>
      )}
    </button>
  )
}

export function GoogleSignInLink({ className }: { className?: string }) {
  const { requestSignIn, loading } = useGoogleAuth()

  if (!GOOGLE_CLIENT_ID) return null

  return (
    <button
      type="button"
      onClick={requestSignIn}
      disabled={loading}
      className={`text-xs text-gray-500 underline underline-offset-2 decoration-gray-300 hover:text-gray-700 cursor-pointer transition-colors font-sans ${className ?? ''}`}
    >
      {loading ? (
        <span className="flex items-center gap-1.5">
          <Spinner className="h-3 w-3" />
          <span>Signing in&hellip;</span>
        </span>
      ) : (
        'Or, sign in with Google'
      )}
    </button>
  )
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}
