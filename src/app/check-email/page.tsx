import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Check your email',
}

export default function CheckEmailPage() {
  return (
    <div className="min-h-screen bg-indigo flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <h1 className="text-3xl font-semibold text-white mb-4">
          Check your email
        </h1>
        <p className="text-white/70 font-serif text-lg">
          A sign-in code is on its way. Enter the code or click the link in the
          email to continue.
        </p>
      </div>
    </div>
  )
}
