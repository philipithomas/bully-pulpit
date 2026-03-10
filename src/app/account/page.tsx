'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { useAuthContext } from '@/components/auth/auth-provider'
import { siteConfig } from '@/lib/config'

const newsletters = [
  { key: 'contraption', ...siteConfig.newsletters.contraption },
  { key: 'workshop', ...siteConfig.newsletters.workshop },
  { key: 'postcard', ...siteConfig.newsletters.postcard },
] as const

export default function AccountPage() {
  const { user, loading, logout } = useAuthContext()
  const router = useRouter()
  const [saving, setSaving] = useState<string | null>(null)

  const handleToggle = useCallback(
    async (newsletter: string, enabled: boolean) => {
      setSaving(newsletter)
      try {
        await fetch('/api/auth/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [newsletter]: enabled }),
        })
      } finally {
        setSaving(null)
      }
    },
    []
  )

  const handleLogout = useCallback(async () => {
    await logout()
    router.push('/')
  }, [logout, router])

  if (loading) {
    return (
      <div className="container py-16 text-center text-gray-500">
        Loading...
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container py-16 text-center">
        <h1 className="text-2xl font-semibold text-gray-950 mb-4">Account</h1>
        <p className="text-gray-600">Please sign in to manage your account.</p>
      </div>
    )
  }

  return (
    <div className="bg-offwhite min-h-[60vh]">
      <div className="container max-w-lg py-12 md:py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-950 mb-8">
          Account
        </h1>

        <section className="mb-10">
          <h2 className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-gray-500 mb-3">
            Email
          </h2>
          <p className="text-gray-900">{user.email}</p>
        </section>

        <section className="mb-10">
          <h2 className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-gray-500 mb-4">
            Newsletters
          </h2>
          <div className="space-y-3">
            {newsletters.map((nl) => (
              <label
                key={nl.key}
                className="flex items-center justify-between py-3 px-4 bg-white border border-gray-200"
              >
                <div>
                  <span className="text-sm font-semibold text-gray-950">
                    {nl.name}
                  </span>
                  <span className="text-sm text-gray-500 ml-2">
                    {nl.tagline}
                  </span>
                </div>
                <input
                  type="checkbox"
                  defaultChecked
                  disabled={saving === nl.key}
                  onChange={(e) => handleToggle(nl.key, e.target.checked)}
                  className="h-4 w-4 accent-gray-900"
                />
              </label>
            ))}
          </div>
        </section>

        <button
          type="button"
          onClick={handleLogout}
          className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
