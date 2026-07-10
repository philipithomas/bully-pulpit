'use client'

import dynamic from 'next/dynamic'
import { useAuthContext } from '@/components/auth/auth-provider'

const NewSubscriberOnboarding = dynamic(
  () =>
    import('@/components/auth/new-subscriber-onboarding').then(
      (module) => module.NewSubscriberOnboarding
    ),
  { ssr: false }
)

/** Loads the full onboarding surface only for a server-approved new member. */
export function LazyNewSubscriberOnboarding() {
  const {
    dismissNewSubscriberOnboarding,
    preferences,
    showNewSubscriberOnboarding,
    user,
  } = useAuthContext()

  if (!showNewSubscriberOnboarding || !user || !preferences) return null

  return (
    <NewSubscriberOnboarding
      initialPreferences={preferences}
      onDismiss={dismissNewSubscriberOnboarding}
      subscriberUuid={user.uuid}
    />
  )
}
