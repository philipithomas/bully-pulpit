'use client'

import { useAuthContext } from '@/components/auth/auth-provider'
import { InlineSignupForm } from '@/components/auth/inline-signup-form'
import type { Newsletter } from '@/lib/content/types'

// What a subscriber receives, per newsletter: Contraption sends essays,
// Workshop sends work in progress notes, Postcard sends monthly updates.
const newsletterNoun: Record<Newsletter, string> = {
  contraption: 'essays',
  workshop: 'notes',
  postcard: 'updates',
}

export function SubscribeCta({ newsletter }: { newsletter: Newsletter }) {
  const { user } = useAuthContext()

  // No loading gate: the CTA must be in the static HTML for logged-out
  // visitors; signed-in members get a brief flash before it collapses.
  if (user) return null

  return (
    <div className="mx-auto max-w-2xl mt-16">
      <p className="font-serif text-gray-600 text-lg mb-5">
        Get new {newsletterNoun[newsletter]} by email.
      </p>
      <InlineSignupForm />
    </div>
  )
}
