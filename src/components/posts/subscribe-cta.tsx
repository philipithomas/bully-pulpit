import { InlineSignupForm } from '@/components/auth/inline-signup-form'

export function SubscribeCta() {
  return (
    <div className="mx-auto max-w-2xl border-t border-gray-200 mt-12 pt-8">
      <p className="font-serif text-gray-600 text-lg mb-5">
        Get new essays by email.
      </p>
      <InlineSignupForm hideWhenLoggedIn />
    </div>
  )
}
