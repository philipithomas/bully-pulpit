'use client'

import { useAuthContext } from '@/components/auth/auth-provider'
import { SmsSubscribePrompt } from '@/components/auth/sms-subscribe-prompt'

interface UmamiSmsSignupProps {
  phoneDisplayNumber: string | null
  phoneNumber: string | null
}

export function UmamiSmsSignup({
  phoneDisplayNumber,
  phoneNumber,
}: UmamiSmsSignupProps) {
  const { user, hasSession } = useAuthContext()

  if (!phoneNumber || user || hasSession) return null

  const initialMemberClassName =
    hasSession === null ? '[[data-member]_&]:hidden' : ''

  return (
    <p
      className={`umami-page-sms text-left font-serif text-sm text-gray-500 ${initialMemberClassName}`}
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
