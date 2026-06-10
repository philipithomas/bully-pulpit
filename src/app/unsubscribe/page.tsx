'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { PreferencesPageSkeleton } from '@/components/auth/preferences-skeleton'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
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
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleted, setDeleted] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

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
          setSaveError(null)
        } else {
          setSaveError('Could not save. Try again.')
        }
      } catch {
        setSaveError('Could not save. Try again.')
      } finally {
        setSaving(null)
      }
    },
    [token, prefs]
  )

  const handleDelete = useCallback(async () => {
    if (!token) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/unsubscribe/${token}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setDeleted(true)
        setShowDeleteModal(false)
        return
      }
      const data = await res.json().catch(() => null)
      setDeleteError(data?.error ?? 'Could not unsubscribe. Please try again.')
    } catch {
      setDeleteError('Could not unsubscribe. Please try again.')
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
            Unsubscribed
          </h1>
          <p className="text-gray-600 mb-6">
            You have been unsubscribed from all newsletters. You can
            re-subscribe anytime. To permanently delete your data, sign in to
            your account.
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
    return <PreferencesPageSkeleton />
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
          Email preferences
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
          {saveError && (
            <p role="alert" className="text-sm text-red mt-3">
              {saveError}
            </p>
          )}
        </section>

        <div className="border-t border-gray-200 pt-8">
          <button
            type="button"
            onClick={() => {
              setDeleteError(null)
              setShowDeleteModal(true)
            }}
            className="text-sm font-medium text-red hover:text-red/80 transition-colors"
          >
            Unsubscribe from all emails
          </button>
        </div>
      </div>

      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogTitle className="mb-3">
            Unsubscribe from everything?
          </DialogTitle>
          <DialogDescription className="mb-6">
            You will stop receiving all newsletters. You can re-subscribe
            anytime. To permanently delete your data instead, sign in to your
            account.
          </DialogDescription>
          {deleteError && (
            <p role="alert" className="text-sm text-red mb-6">
              {deleteError}
            </p>
          )}
          <div className="flex flex-wrap gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <span className="flex items-center gap-2">
                  <Spinner className="h-3.5 w-3.5" />
                  Unsubscribing
                </span>
              ) : (
                'Unsubscribe from all'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<PreferencesPageSkeleton />}>
      <UnsubscribeContent />
    </Suspense>
  )
}
