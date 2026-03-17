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
      toast.error('Sign-in failed — please try again')
    } else {
      return
    }
    router.replace(window.location.pathname, { scroll: false })
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
