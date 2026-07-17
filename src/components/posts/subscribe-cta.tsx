'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useAuthContext } from '@/components/auth/auth-provider'
import { InlineSignupForm } from '@/components/auth/inline-signup-form'
import { SmsSubscribePrompt } from '@/components/auth/sms-subscribe-prompt'
import { Spinner } from '@/components/ui/spinner'
import {
  type AnalyticsPlacement,
  trackClientEvent,
} from '@/lib/analytics/events'
import { siteConfig } from '@/lib/config'
import type { Newsletter } from '@/lib/content/types'
import {
  type ActiveNewsletter,
  isNewsletterAcceptingSubscriptions,
  newsletterPreferenceKeys,
} from '@/lib/newsletters'

// What a subscriber receives, per newsletter: Contraption sends essays,
// Workshop sends work in progress notes, Postcard sends monthly updates.
const newsletterNoun: Record<Newsletter, string> = {
  contraption: 'essays',
  workshop: 'notes',
  postcard: 'updates',
  umami: 'photos',
  tsundoku: 'photos',
}

interface SubscribeCtaProps {
  newsletter: Newsletter
  className?: string
  buttonClassName?: string
  buttonLabel?: string
  align?: 'start' | 'center'
  subscribeEndpoint?: string
  successRedirect?: '/account'
  smsSignupPhoneNumber?: string | null
  smsSignupDisplayNumber?: string | null
  analyticsPlacement?: AnalyticsPlacement
}

export function SubscribeCta(props: SubscribeCtaProps) {
  if (!isNewsletterAcceptingSubscriptions(props.newsletter)) return null
  return <ActiveSubscribeCta {...props} newsletter={props.newsletter} />
}

function ActiveSubscribeCta({
  newsletter,
  className = 'mt-16',
  buttonClassName = 'btn btn-primary',
  buttonLabel,
  align = 'start',
  subscribeEndpoint,
  successRedirect = newsletter === 'umami' ? '/account' : undefined,
  smsSignupPhoneNumber = null,
  smsSignupDisplayNumber = null,
  analyticsPlacement = 'post_footer',
}: Omit<SubscribeCtaProps, 'newsletter'> & {
  newsletter: ActiveNewsletter
}) {
  const { user, preferences, setPreferences, hasSession, loading } =
    useAuthContext()
  const [saving, setSaving] = useState(false)
  const key = newsletterPreferenceKeys[newsletter]
  const config = siteConfig.newsletters[newsletter]
  const resolvedButtonLabel = buttonLabel ?? `Subscribe to ${config.name}`
  const subscribed = preferences ? Boolean(preferences[key]) : false
  const initialMemberClassName =
    hasSession === null ? '[[data-member]_&]:hidden' : ''

  const subscribeSignedIn = useCallback(async () => {
    trackClientEvent('Newsletter preference submitted', {
      placement: analyticsPlacement,
      newsletter,
      subscribed: true,
    })
    setSaving(true)
    try {
      const res = await fetch('/api/auth/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [key]: true,
          analytics_placement: analyticsPlacement,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error ?? 'Could not subscribe. Try again.')
        return
      }
      const data = await res.json().catch(() => null)
      setPreferences(
        (prev) => data?.preferences ?? (prev ? { ...prev, [key]: true } : prev)
      )
      if (successRedirect) {
        window.location.assign(successRedirect)
        return
      }
      toast.success(`Subscribed to ${config.name}`)
    } catch {
      toast.error('Could not subscribe. Try again.')
    } finally {
      setSaving(false)
    }
  }, [
    analyticsPlacement,
    config.name,
    key,
    newsletter,
    setPreferences,
    successRedirect,
  ])

  if (hasSession && loading) return null
  if (user && (!preferences || subscribed)) return null

  return (
    <div
      className={`mx-auto w-full max-w-2xl ${initialMemberClassName} ${className}`}
    >
      <p className="font-serif text-gray-600 text-lg mb-5">
        Get new {newsletterNoun[newsletter]} by email:
      </p>
      {user ? (
        <>
          <button
            type="button"
            onClick={subscribeSignedIn}
            disabled={saving}
            className={buttonClassName}
          >
            <span className="btn-text">
              {saving ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <span>{resolvedButtonLabel}</span>
              )}
            </span>
          </button>
          <SmsSubscribePrompt
            align={align}
            phoneDisplayNumber={smsSignupDisplayNumber}
            phoneNumber={smsSignupPhoneNumber}
            analyticsPlacement={analyticsPlacement}
            newsletter={newsletter}
          />
        </>
      ) : (
        <InlineSignupForm
          align={align}
          buttonClassName={buttonClassName}
          buttonLabel={buttonLabel}
          confirmedMessage={`You are subscribed to new ${newsletterNoun[newsletter]} by email.`}
          newsletters={[newsletter]}
          smsSignupDisplayNumber={smsSignupDisplayNumber}
          smsSignupPhoneNumber={smsSignupPhoneNumber}
          subscribeEndpoint={subscribeEndpoint}
          successRedirect={successRedirect}
          analyticsPlacement={analyticsPlacement}
        />
      )}
    </div>
  )
}
