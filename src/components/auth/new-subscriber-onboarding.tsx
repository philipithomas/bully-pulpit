'use client'

import Image from 'next/image'
import Link from 'next/link'
import { type ChangeEvent, type FormEvent, useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useAuthContext } from '@/components/auth/auth-provider'
import { BrandedAuthDialog } from '@/components/auth/branded-auth-dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { trackClientEvent } from '@/lib/analytics/events'
import type {
  SubscriberPreferenceKey,
  SubscriberPreferences,
} from '@/lib/auth/preferences'
import { acceptingNewsletterRows } from '@/lib/newsletters'
import { SUBSCRIBER_WELCOME_MESSAGE, useChatSidebar } from '@/stores/chat-store'

const newsletterInfo = acceptingNewsletterRows()

interface NewSubscriberOnboardingProps {
  initialPreferences: SubscriberPreferences
  onDismiss: () => void
  subscriberUuid: string
}

interface PreferenceUpdateResponse {
  error?: string
  preferences?: SubscriberPreferences
}

export function NewSubscriberOnboarding({
  initialPreferences,
  onDismiss,
  subscriberUuid,
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
      setDraft((current) => ({ ...current, [key]: checked }))
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
        const activePreferences = Object.fromEntries(
          newsletterInfo.map((newsletter) => [
            newsletter.key,
            draft[newsletter.key],
          ])
        )
        const response = await fetch('/api/auth/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...activePreferences,
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
        toast.success('Preferences saved')
        setOpen(false)
        useChatSidebar
          .getState()
          .openSidebarWithLocalMessage(SUBSCRIBER_WELCOME_MESSAGE, {
            conversationIdentity: `subscriber:${subscriberUuid}`,
            entrySource: 'onboarding',
          })
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : 'Could not save. Try again.'
        )
      } finally {
        setSaving(false)
      }
    },
    [draft, initialPreferences, setPreferences, subscriberUuid]
  )

  const handleOpenChangeComplete = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) onDismiss()
    },
    [onDismiss]
  )
  const handleNavigate = useCallback(() => setOpen(false), [])

  return (
    <BrandedAuthDialog
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={handleOpenChangeComplete}
      title="Choose your newsletters"
      description={
        <>
          You are subscribed as {initialPreferences.email}. Choose which
          newsletters you want to subscribe to:
        </>
      }
      footer={
        <p className="max-w-xl text-xs leading-relaxed text-gray-500">
          You can change these choices later in{' '}
          <Link
            href="/account"
            onClick={handleNavigate}
            className="underline decoration-gray-300 underline-offset-2 hover:text-gray-950"
          >
            Account
          </Link>
          .
        </p>
      }
    >
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

        <div className="mt-6">
          <Button type="submit" disabled={saving} className="w-full sm:w-auto">
            {saving ? <Spinner className="h-4 w-4" /> : null}
            Save preferences
          </Button>
        </div>
      </form>
    </BrandedAuthDialog>
  )
}
