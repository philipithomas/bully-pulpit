import type { ReactNode } from 'react'
import { InlineSignupForm } from '@/components/auth/inline-signup-form'

/**
 * Editorial introduction card at the top of a newsletter index page: a few
 * sentences describing the newsletter, with an inline signup for visitors
 * who are not signed in.
 */
export function NewsletterIntro({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl bg-offwhite-light border border-gray-100 rounded-sm p-6 md:p-8 mb-12 md:mb-16">
      <p className="font-serif text-gray-600 leading-relaxed mb-6">
        {children}
      </p>
      <InlineSignupForm hideWhenLoggedIn />
    </div>
  )
}
