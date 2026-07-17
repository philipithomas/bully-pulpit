'use client'

import { useAuthContext } from '@/components/auth/auth-provider'
import { SmsSubscribePrompt } from '@/components/auth/sms-subscribe-prompt'
import { cn } from '@/lib/utils'

export function UmamiSmsSignup({
  phoneDisplayNumber,
  phoneNumber,
}: {
  phoneDisplayNumber?: string | null
  phoneNumber?: string | null
}) {
  const { user, hasSession, loading } = useAuthContext()

  if (!phoneNumber) return null
  if (hasSession && loading) return null
  if (user) return null

  return (
    <p
      className={cn(
        'umami-page-sms text-left font-serif text-sm text-gray-500',
        hasSession === null && '[[data-member]_&]:hidden'
      )}
    >
      Also available via{' '}
      <SmsSubscribePrompt
        analyticsPlacement="newsletter_page"
        newsletter="umami"
        phoneDisplayNumber={phoneDisplayNumber}
        phoneNumber={phoneNumber}
        triggerClassName="decoration-umami/60 hover:text-umami-ink"
        triggerLabel="SMS"
        variant="link"
      />
      .
    </p>
  )
}
