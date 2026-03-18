'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useAuthContext } from '@/components/auth/auth-provider'
import { Spinner } from '@/components/ui/spinner'
import { siteConfig } from '@/lib/config'

const newsletterInfo = [
  { key: 'subscribed_contraption', ...siteConfig.newsletters.contraption },
  { key: 'subscribed_workshop', ...siteConfig.newsletters.workshop },
  { key: 'subscribed_postcard', ...siteConfig.newsletters.postcard },
] as const

interface Preferences {
  email: string
  subscribed_contraption: boolean
  subscribed_workshop: boolean
  subscribed_postcard: boolean
}

export default function AccountPage() {
  const { user, loading, logout } = useAuthContext()
  const router = useRouter()
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)

  useEffect(() => {
    if (!user) return

    fetch('/api/auth/preferences')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load preferences')
        return res.json()
      })
      .then(setPrefs)
      .catch(() => {})
  }, [user])

  const handleToggle = useCallback(
    async (key: string, enabled: boolean) => {
      if (!prefs) return
      setSaving(key)
      setSaved(false)
      try {
        const res = await fetch('/api/auth/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: enabled }),
        })
        if (res.ok) {
          setPrefs((prev) => (prev ? { ...prev, [key]: enabled } : prev))
          setSaved(true)
        }
      } finally {
        setSaving(null)
      }
    },
    [prefs]
  )

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/auth/preferences', {
        method: 'DELETE',
      })
      if (res.ok) {
        await logout()
        setDeleted(true)
        setShowDeleteModal(false)
      }
    } finally {
      setDeleting(false)
    }
  }, [logout])

  if (loading) {
    return (
      <div className="bg-offwhite min-h-[60vh]">
        <div className="container max-w-lg py-16 flex justify-center">
          <Spinner className="h-6 w-6 text-gray-400" />
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="bg-offwhite min-h-[60vh]">
        <div className="container max-w-lg py-12 md:py-16 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-950 mb-4">
            Account
          </h1>
          <p className="text-gray-600">
            Please sign in to manage your account.
          </p>
        </div>
      </div>
    )
  }

  if (deleted) {
    return (
      <div className="bg-offwhite min-h-[60vh]">
        <div className="container max-w-lg py-12 md:py-16">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-950 mb-4">
            Account Deleted
          </h1>
          <p className="text-gray-600 mb-6">
            Your subscription and all associated data have been permanently
            deleted.
          </p>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            Return to homepage
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-offwhite min-h-[60vh]">
      <div className="container max-w-lg py-12 md:py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-950 mb-8">
          Account
        </h1>

        <section className="mb-6">
          <h2 className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-gray-500 mb-3">
            Email
          </h2>
          <p className="text-gray-900">{prefs?.email ?? user.email}</p>
        </section>

        {prefs && (
          <section className="mb-10">
            <h2 className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-gray-500 mb-4">
              Newsletters
            </h2>
            <div className="space-y-3">
              {newsletterInfo.map((nl) => (
                <label
                  key={nl.key}
                  className="flex items-center justify-between py-3 px-4 bg-white border border-gray-200"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-[76px] shrink-0 flex items-center">
                      <Image
                        src={nl.logo.src}
                        alt={nl.name}
                        width={100}
                        height={nl.logo.height}
                        style={{ height: nl.logo.height }}
                        className="w-auto shrink-0"
                      />
                    </span>
                    <span className="text-sm text-gray-500">{nl.tagline}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs[nl.key as keyof Preferences] as boolean}
                    disabled={saving === nl.key}
                    onChange={(e) => handleToggle(nl.key, e.target.checked)}
                    className="h-4 w-4 accent-gray-900"
                  />
                </label>
              ))}
            </div>
            {saved && (
              <p className="text-sm text-gray-500 mt-3">Preferences saved.</p>
            )}
          </section>
        )}

        {!prefs && (
          <div className="mb-10 flex items-center gap-2 text-sm text-gray-500">
            <Spinner className="h-3.5 w-3.5" />
            <span>Loading preferences</span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-gray-200 pt-8">
          <button
            type="button"
            onClick={async () => {
              await logout()
              router.push('/')
            }}
            className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            Sign out
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="text-sm font-medium text-red-600 hover:text-red-800 transition-colors"
          >
            Delete my data
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowDeleteModal(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowDeleteModal(false)
            }}
          />
          <div className="relative bg-white max-w-md w-full mx-4 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-950 mb-3">
              Delete all data?
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              This will permanently delete your subscription and all associated
              data including email history. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? (
                  <span className="flex items-center gap-2">
                    <Spinner className="h-3.5 w-3.5" />
                    Deleting
                  </span>
                ) : (
                  'Delete my data'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
