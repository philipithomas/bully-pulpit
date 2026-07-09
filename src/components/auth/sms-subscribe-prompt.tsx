'use client'

import { useEffect, useState } from 'react'
import {
  type AnalyticsNewsletter,
  type AnalyticsPlacement,
  trackClientEvent,
} from '@/lib/analytics/events'

export function SmsSubscribePrompt({
  enabled,
  phoneNumber,
  phoneDisplayNumber,
  align = 'start',
  className = 'mt-3',
  analyticsPlacement = 'unknown',
  newsletter = 'unspecified',
}: {
  enabled?: boolean
  phoneNumber?: string | null
  phoneDisplayNumber?: string | null
  align?: 'start' | 'center'
  className?: string
  analyticsPlacement?: AnalyticsPlacement
  newsletter?: AnalyticsNewsletter
}) {
  const [resolvedEnabled, setResolvedEnabled] = useState(enabled ?? false)

  useEffect(() => {
    if (enabled !== undefined) {
      setResolvedEnabled(enabled)
      return
    }

    let cancelled = false
    fetch('/api/flags/sms-signup-ui', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setResolvedEnabled(Boolean(data?.enabled))
      })
      .catch(() => {
        if (!cancelled) setResolvedEnabled(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  if (!resolvedEnabled || !phoneNumber) return null

  const displayNumber = phoneDisplayNumber ?? phoneNumber

  return (
    <p
      className={`${className} max-w-md font-serif text-gray-500 text-sm leading-relaxed ${
        align === 'center' ? 'text-center' : ''
      }`}
    >
      Or text{' '}
      <span className="font-sans font-medium text-gray-700">SUBSCRIBE</span> to{' '}
      <a
        href={`sms:${phoneNumber}?body=SUBSCRIBE`}
        onClick={() =>
          trackClientEvent('SMS signup opened', {
            placement: analyticsPlacement,
            newsletter,
          })
        }
        className="font-sans text-gray-700 underline decoration-gray-300 underline-offset-2 transition-colors hover:text-gray-950"
      >
        {displayNumber}
      </a>
      .
    </p>
  )
}
