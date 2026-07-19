'use client'

import { useAuthContext } from '@/components/auth/auth-provider'
import { SmsSubscribePrompt } from '@/components/auth/sms-subscribe-prompt'

interface TidbitsSmsSignupProps {
  phoneDisplayNumber: string | null
  phoneNumber: string | null
}

export function TidbitsSmsSignup({
  phoneDisplayNumber,
  phoneNumber,
}: TidbitsSmsSignupProps) {
  const { user, hasSession } = useAuthContext()

  if (!phoneNumber || user || hasSession) return null

  const initialMemberClassName =
    hasSession === null ? '[[data-member]_&]:hidden' : ''

  return (
    <p
      className={`tidbits-page-sms text-left font-serif text-sm text-gray-500 ${initialMemberClassName}`}
    >
      Also available via{' '}
      <SmsSubscribePrompt
        analyticsPlacement="newsletter_page"
        newsletter="tidbits"
        phoneDisplayNumber={phoneDisplayNumber}
        phoneNumber={phoneNumber}
        triggerClassName="decoration-tidbits/60 hover:text-tidbits-ink"
        triggerLabel="SMS"
        variant="link"
      />
      .
    </p>
  )
}
