'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useAuthContext } from '@/components/auth/auth-provider'
import {
  NewsletterRowsSkeleton,
  PreferencesPageSkeleton,
} from '@/components/auth/preferences-skeleton'
import { prefetchSignInModal } from '@/components/auth/sign-in-modal-lazy'
import { ArrowIcon } from '@/components/ui/arrow-icon'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { siteConfig } from '@/lib/config'
import { useAuthModal } from '@/stores/auth-store'

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

export function AccountClient() {
  const { user, loading, logout } = useAuthContext()
  const { openModal } = useAuthModal()
  const router = useRouter()
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [prefsError, setPrefsError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleted, setDeleted] = useState(false)

  useEffect(() => {
    if (!user) return

    fetch('/api/auth/preferences')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load preferences')
        return res.json()
      })
      .then(setPrefs)
      .catch((e) => setPrefsError(e.message))
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
    [prefs]
  )

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/auth/preferences', {
        method: 'DELETE',
      })
      if (res.ok) {
        await logout()
        setDeleted(true)
        setShowDeleteModal(false)
        return
      }
      const data = await res.json().catch(() => null)
      setDeleteError(
        data?.error ?? 'Could not delete your data. Please try again.'
      )
    } catch {
      setDeleteError('Could not delete your data. Please try again.')
    } finally {
      setDeleting(false)
    }
  }, [logout])

  if (loading) {
    return <PreferencesPageSkeleton title="Account" />
  }

  if (!user) {
    return (
      <div className="bg-offwhite min-h-[60vh]">
        <div className="container max-w-lg py-12 md:py-16 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-950 mb-4">
            Account
          </h1>
          <p className="text-gray-600 mb-6">
            Please sign in to manage your account.
          </p>
          <button
            type="button"
            onClick={openModal}
            onMouseEnter={prefetchSignInModal}
            onFocus={prefetchSignInModal}
            className="btn btn-primary"
          >
            <span className="btn-text">Sign in</span>
            <span className="btn-arrow">
              <ArrowIcon className="w-4 h-4" />
            </span>
          </button>
        </div>
      </div>
    )
  }

  if (deleted) {
    return (
      <div className="bg-offwhite min-h-[60vh]">
        <div className="container max-w-lg py-12 md:py-16">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-950 mb-4">
            Account deleted
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
            {saveError && (
              <p role="alert" className="text-sm text-red mt-3">
                {saveError}
              </p>
            )}
          </section>
        )}

        {!prefs && prefsError && (
          <p role="alert" className="mb-10 text-sm text-red">
            {prefsError}
          </p>
        )}

        {!prefs && !prefsError && (
          <section className="mb-10">
            <h2 className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-gray-500 mb-4">
              Newsletters
            </h2>
            <NewsletterRowsSkeleton />
          </section>
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
            onClick={() => {
              setDeleteError(null)
              setShowDeleteModal(true)
            }}
            className="text-sm font-medium text-red hover:text-red/80 transition-colors"
          >
            Delete my data
          </button>
        </div>
      </div>

      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogTitle className="mb-3">Delete all data?</DialogTitle>
          <DialogDescription className="mb-6">
            This will permanently delete your subscription and all associated
            data including email history. This cannot be undone.
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
                  Deleting
                </span>
              ) : (
                'Delete my data'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
