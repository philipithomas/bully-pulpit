'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'
import { toast } from 'sonner'

function SignInToastInner() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    if (searchParams.get('signed-in') === '1') {
      toast.success('Signed in successfully')
      router.replace(window.location.pathname, { scroll: false })
    }
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
