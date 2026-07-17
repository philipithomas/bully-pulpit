'use client'

import { useSearchParams } from 'next/navigation'
import { type ComponentProps, Suspense } from 'react'
import { SubscribeCta } from '@/components/posts/subscribe-cta'

type PostSubscribeCtaProps = ComponentProps<typeof SubscribeCta>

function PostSubscribeCtaForCurrentUrl(props: PostSubscribeCtaProps) {
  const searchParams = useSearchParams()

  if (searchParams.get('utm_source') === 'sms') return null

  return (
    <SubscribeCta
      {...props}
      buttonClassName={
        props.buttonClassName ?? 'btn btn-primary btn-newsletter'
      }
    />
  )
}

export function PostSubscribeCta(props: PostSubscribeCtaProps) {
  return (
    <Suspense fallback={null}>
      <PostSubscribeCtaForCurrentUrl {...props} />
    </Suspense>
  )
}
