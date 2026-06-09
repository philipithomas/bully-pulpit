'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'
import { toast } from 'sonner'

function SignInToastInner() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const error = searchParams.get('error')
    if (searchParams.get('signed-in') === '1') {
      toast.success('Signed in successfully')
    } else if (error === 'invalid-token') {
      toast.error('Invalid or expired sign-in link')
    } else if (error === 'verify-failed') {
      toast.error('Sign-in failed. Please try again.')
    } else {
      return
    }
    // Strip only our params — keep e.g. ?token= on /unsubscribe intact.
    // toString() rather than .size: size is missing on browsers Next still
    // supports (pre-Chrome 113 / Safari 17), where it would strip everything.
    const params = new URLSearchParams(searchParams)
    params.delete('signed-in')
    params.delete('error')
    const qs = params.toString()
    router.replace(
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
      { scroll: false }
    )
  }, [searchParams, router])

  return null
}

export function SignInToast() {
  return (
    <Suspense>
      <SignInToastInner />
    </Suspense>
  )
}
