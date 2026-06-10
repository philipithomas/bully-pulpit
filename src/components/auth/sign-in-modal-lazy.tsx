'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useAuthModal } from '@/stores/auth-store'

// dynamic() splits the sign-in modal (radix dialog, OTP input, Google
// sign-in) out of the first-load bundle — same pattern as the header's
// search dialog and chat sidebar.
const SignInModal = dynamic(
  () => import('@/components/auth/sign-in-modal').then((m) => m.SignInModal),
  { ssr: false }
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

  // Warm the chunk once during idle time after first paint, so the first
  // tap is instant on touch devices where the hover/focus prefetch on the
  // triggers never fires. Members never open the modal, so the pre-paint
  // session hint on <html> skips the warm for them. Idle/timeout scheduling
  // keeps it off the hydration path; repeat calls are no-ops because dynamic
  // import caches the module.
  useEffect(() => {
    if (document.documentElement.hasAttribute('data-member')) return
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(prefetchSignInModal, {
        timeout: 5000,
      })
      return () => window.cancelIdleCallback(id)
    }
    // Safari has no requestIdleCallback
    const id = window.setTimeout(prefetchSignInModal, 2000)
    return () => window.clearTimeout(id)
  }, [])

  if (!open && !hasOpened) return null
  return <SignInModal />
}
