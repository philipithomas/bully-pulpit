'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { siteConfig } from '@/lib/config'

const newsletterInfo = [
  { key: 'subscribed_contraption', ...siteConfig.newsletters.contraption },
  { key: 'subscribed_workshop', ...siteConfig.newsletters.workshop },
  { key: 'subscribed_postcard', ...siteConfig.newsletters.postcard },
] as const

interface Preferences {
  email: string
  newsletter: string | null
  subscribed_postcard: boolean
  subscribed_contraption: boolean
  subscribed_workshop: boolean
}

function UnsubscribeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')

  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Missing unsubscribe token.')
      return
    }

    fetch(`/api/unsubscribe/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('Invalid or expired unsubscribe link.')
        return res.json()
      })
      .then(setPrefs)
      .catch((e) => setError(e.message))
  }, [token])

  const handleToggle = useCallback(
    async (key: string, enabled: boolean) => {
      if (!token || !prefs) return
      setSaving(key)
      setSaved(false)
      try {
        const res = await fetch(`/api/unsubscribe/${token}`, {
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
    [token, prefs]
  )

  const handleDelete = useCallback(async () => {
    if (!token) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/unsubscribe/${token}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setDeleted(true)
        setShowDeleteModal(false)
      }
    } finally {
      setDeleting(false)
    }
  }, [token])

  if (error) {
    return (
      <div className="bg-offwhite min-h-[60vh]">
        <div className="container max-w-lg py-12 md:py-16">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-950 mb-4">
            Unsubscribe
          </h1>
          <p className="text-gray-600">{error}</p>
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

  if (!prefs) {
    return (
      <div className="bg-offwhite min-h-[60vh]">
        <div className="container max-w-lg py-16 text-center text-gray-500">
          Loading...
        </div>
      </div>
    )
  }

  const sourceNewsletter = prefs.newsletter
    ? siteConfig.newsletters[
        prefs.newsletter as keyof typeof siteConfig.newsletters
      ]
    : null

  return (
    <div className="bg-offwhite min-h-[60vh]">
      <div className="container max-w-lg py-12 md:py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-950 mb-2">
          Email Preferences
        </h1>
        {sourceNewsletter && (
          <p className="text-gray-500 mb-8">
            You received an email from{' '}
            <span className="font-medium text-gray-700">
              {sourceNewsletter.name}
            </span>
          </p>
        )}
        {!sourceNewsletter && <div className="mb-8" />}

        <section className="mb-6">
          <h2 className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-gray-500 mb-3">
            Email
          </h2>
          <p className="text-gray-900">{prefs.email}</p>
        </section>

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

        <div className="border-t border-gray-200 pt-8">
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="text-sm font-medium text-red-600 hover:text-red-800 transition-colors"
          >
            Unsubscribe from all and delete my data
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
                {deleting ? 'Deleting...' : 'Delete my data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="bg-offwhite min-h-[60vh]">
          <div className="container max-w-lg py-16 text-center text-gray-500">
            Loading...
          </div>
        </div>
      }
    >
      <UnsubscribeContent />
    </Suspense>
  )
}
