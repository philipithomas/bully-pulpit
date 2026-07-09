'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import {
  parseAnalyticsNewsletter,
  trackClientEvent,
} from '@/lib/analytics/events'

function SignInToastInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const trackedSignup = useRef(false)

  useEffect(() => {
    const error = searchParams.get('error')
    if (searchParams.get('signed-in') === '1') {
      if (
        searchParams.get('analytics-signup') === 'email-link' &&
        !trackedSignup.current
      ) {
        trackedSignup.current = true
        trackClientEvent('Newsletter signup completed', {
          method: 'email_link',
          placement: 'unknown',
          newsletter: parseAnalyticsNewsletter(
            searchParams.get('analytics-newsletter')
          ),
          new_subscriber: searchParams.get('analytics-new-subscriber') === '1',
        })
      }
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
    params.delete('analytics-signup')
    params.delete('analytics-newsletter')
    params.delete('analytics-new-subscriber')
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
