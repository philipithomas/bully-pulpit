'use client'

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { redactAnalyticsEvent } from '@/lib/analytics/privacy'

function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  return redactAnalyticsEvent(event, window.location.origin)
}

function beforeSendSpeedInsights(event: {
  type: 'vital'
  url: string
  route?: string
}) {
  return redactAnalyticsEvent(event, window.location.origin)
}

export function PublicAnalytics() {
  return (
    <>
      <Analytics beforeSend={beforeSend} />
      <SpeedInsights beforeSend={beforeSendSpeedInsights} />
    </>
  )
}
