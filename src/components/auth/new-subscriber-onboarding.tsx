'use client'

import { X } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { type ChangeEvent, type FormEvent, useCallback, useState } from 'react'
import { useAuthContext } from '@/components/auth/auth-provider'
import { Logo } from '@/components/layout/logo'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { trackClientEvent } from '@/lib/analytics/events'
import type {
  SubscriberPreferenceKey,
  SubscriberPreferences,
} from '@/lib/auth/preferences'
import { newsletterRows } from '@/lib/newsletters'

const newsletterInfo = newsletterRows()

interface NewSubscriberOnboardingProps {
  initialPreferences: SubscriberPreferences
  onDismiss: () => void
}

interface PreferenceUpdateResponse {
  error?: string
  preferences?: SubscriberPreferences
}

export function NewSubscriberOnboarding({
  initialPreferences,
  onDismiss,
}: NewSubscriberOnboardingProps) {
  const { setPreferences } = useAuthContext()
  const [draft, setDraft] = useState(initialPreferences)
  const [open, setOpen] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handlePreferenceChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const preference = newsletterInfo.find(
        (newsletter) => newsletter.key === event.currentTarget.name
      )
      if (!preference) return
      const key: SubscriberPreferenceKey = preference.key
      const checked = event.currentTarget.checked
      setDraft((current) => ({
        ...current,
        [key]: checked,
      }))
      setSaveError(null)
    },
    []
  )

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setSaving(true)
      setSaveError(null)

      for (const newsletter of newsletterInfo) {
        if (draft[newsletter.key] === initialPreferences[newsletter.key]) {
          continue
        }
        trackClientEvent('Newsletter preference submitted', {
          placement: 'onboarding',
          newsletter: newsletter.slug,
          subscribed: draft[newsletter.key],
        })
      }

      try {
        const response = await fetch('/api/auth/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscribed_contraption: draft.subscribed_contraption,
            subscribed_workshop: draft.subscribed_workshop,
            subscribed_postcard: draft.subscribed_postcard,
            subscribed_tsundoku: draft.subscribed_tsundoku,
            analytics_placement: 'onboarding',
          }),
        })
        const data = (await response
          .json()
          .catch(() => null)) as PreferenceUpdateResponse | null
        if (!response.ok) {
          throw new Error(data?.error ?? 'Could not save. Try again.')
        }

        setPreferences(data?.preferences ?? draft)
        setOpen(false)
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : 'Could not save. Try again.'
        )
      } finally {
        setSaving(false)
      }
    },
    [draft, initialPreferences, setPreferences]
  )

  const handleOpenChangeComplete = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) onDismiss()
    },
    [onDismiss]
  )

  const handleNavigate = useCallback(() => setOpen(false), [])

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={handleOpenChangeComplete}
    >
      <DialogContent
        showCloseButton={false}
        className="inset-0 left-0 top-0 z-[70] h-dvh w-screen max-w-none translate-x-0 translate-y-0 overflow-y-auto bg-offwhite p-0 shadow-none duration-500 data-[ending-style]:scale-[0.99] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.99] data-[starting-style]:opacity-0 motion-reduce:transition-none"
      >
        <div className="grid min-h-dvh lg:grid-cols-2">
          <section className="flex min-h-dvh flex-col px-6 py-6 sm:px-10 sm:py-8 lg:px-12 xl:px-16">
            <div className="flex items-center justify-between gap-6">
              <div onClickCapture={handleNavigate}>
                <Logo />
              </div>
              <DialogClose asChild>
                <button
                  type="button"
                  aria-label="Skip onboarding"
                  className="-m-2 p-2 text-gray-500 transition-colors hover:text-gray-950"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </DialogClose>
            </div>

            <div className="my-auto w-full max-w-xl animate-in fade-in slide-in-from-bottom-2 py-10 duration-500 motion-reduce:animate-none sm:py-12">
              <DialogTitle className="text-3xl sm:text-4xl">
                Choose your newsletters
              </DialogTitle>
              <DialogDescription className="mt-3 max-w-lg font-serif text-base leading-relaxed text-gray-600 sm:text-lg">
                You are subscribed as {initialPreferences.email}. Choose what
                you want to receive.
              </DialogDescription>

              <form onSubmit={handleSubmit} className="mt-8">
                <fieldset disabled={saving} className="space-y-3">
                  <legend className="sr-only">Newsletter preferences</legend>
                  {newsletterInfo.map((newsletter) => (
                    <label
                      key={newsletter.key}
                      className="flex cursor-pointer items-center justify-between gap-4 border border-gray-200 bg-white px-4 py-4 transition-colors hover:border-gray-300"
                    >
                      <span className="flex min-w-0 items-center gap-4">
                        <span className="flex w-[100px] shrink-0 items-center">
                          <Image
                            src={newsletter.logo.src}
                            alt={newsletter.name}
                            width={100}
                            height={newsletter.logo.height}
                            style={{ height: newsletter.logo.height }}
                            className="w-auto shrink-0"
                          />
                        </span>
                        <span className="min-w-0 font-serif text-xs leading-snug text-gray-500 sm:text-sm">
                          {newsletter.tagline}
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        name={newsletter.key}
                        checked={draft[newsletter.key]}
                        onChange={handlePreferenceChange}
                        className="h-4 w-4 shrink-0 accent-gray-900"
                      />
                    </label>
                  ))}
                </fieldset>

                {saveError ? (
                  <p role="alert" className="mt-4 text-sm text-red">
                    {saveError}
                  </p>
                ) : null}

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    type="submit"
                    disabled={saving}
                    className="w-full sm:w-auto"
                  >
                    {saving ? <Spinner className="h-4 w-4" /> : null}
                    Save preferences
                  </Button>
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={saving}
                      className="w-full sm:w-auto"
                    >
                      Skip for now
                    </Button>
                  </DialogClose>
                </div>
              </form>
            </div>

            <p className="max-w-xl text-xs leading-relaxed text-gray-500">
              By continuing, you agree to the{' '}
              <Link
                href="/terms"
                onClick={handleNavigate}
                className="underline decoration-gray-300 underline-offset-2 hover:text-gray-950"
              >
                Terms of service
              </Link>{' '}
              and acknowledge the{' '}
              <Link
                href="/privacy"
                onClick={handleNavigate}
                className="underline decoration-gray-300 underline-offset-2 hover:text-gray-950"
              >
                Privacy policy
              </Link>
              . You can change these choices later in{' '}
              <Link
                href="/account"
                onClick={handleNavigate}
                className="underline decoration-gray-300 underline-offset-2 hover:text-gray-950"
              >
                Account
              </Link>
              .
            </p>
          </section>

          <div className="relative hidden min-h-dvh animate-in fade-in overflow-hidden duration-700 motion-reduce:animate-none lg:block">
            <Image
              src="/images/paris-small.jpg"
              alt=""
              fill
              sizes="50vw"
              className="object-cover"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
