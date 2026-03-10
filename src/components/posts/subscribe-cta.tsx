import { EmailSignupForm } from '@/components/auth/email-signup-form'

export function SubscribeCta() {
  return (
    <div className="border-t border-gray-200 mt-12 pt-8 max-w-2xl mx-auto">
      <h3 className="text-lg font-semibold text-gray-950 mb-2">
        Stay up to date
      </h3>
      <p className="font-serif text-sm text-gray-600 mb-4">
        Subscribe to get new posts delivered to your inbox.
      </p>
      <EmailSignupForm />
    </div>
  )
}
