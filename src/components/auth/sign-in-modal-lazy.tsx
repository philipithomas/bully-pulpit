'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { useAuthModal } from '@/stores/auth-store'

// The deferred dialog will move and trap focus once it loads. This interim
// status stays non-interactive and non-modal, preserving focus on the trigger.
export function SignInModalLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-2 bg-card px-4 py-3 font-sans text-sm text-gray-600 shadow-xl"
    >
      <Spinner className="h-4 w-4" />
      <span>Opening sign in…</span>
    </div>
  )
}

// dynamic() splits the sign-in modal (Base UI dialog, OTP input, Google
// sign-in) out of the first-load bundle — same pattern as the header's
// search dialog and chat sidebar.
const SignInModal = dynamic(
  () => import('@/components/auth/sign-in-modal').then((m) => m.SignInModal),
  { loading: SignInModalLoading, ssr: false }
)

/** Warm the modal chunk so the first click opens instantly. */
export const prefetchSignInModal = () =>
  void import('@/components/auth/sign-in-modal')

export function LazySignInModal() {
  const open = useAuthModal((s) => s.open)
  // Stays true after first open so the dialog keeps its mounted state and
  // can play its close animation.
  const [hasOpened, setHasOpened] = useState(false)

  useEffect(() => {
    if (open) setHasOpened(true)
  }, [open])

  if (!open && !hasOpened) return null
  return <SignInModal />
}
