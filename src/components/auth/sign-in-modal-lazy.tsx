'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { useAuthModal } from '@/stores/auth-store'

export function SignInModalLoading() {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign in or join"
        aria-busy="true"
        className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 bg-card p-8 shadow-xl"
      >
        <div className="flex flex-col gap-2 text-center">
          <h2 className="font-sans text-xl font-semibold tracking-tight text-gray-950">
            Sign in or join
          </h2>
          <p className="text-sm text-muted-foreground">
            Enter your email to sign in or create an account.
          </p>
        </div>
        <div
          role="status"
          className="mt-6 flex items-center justify-center gap-2 font-sans text-sm text-gray-500"
        >
          <Spinner className="h-4 w-4" />
          <span>Opening sign in…</span>
        </div>
      </div>
    </>
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
