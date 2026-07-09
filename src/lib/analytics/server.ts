import { track } from '@vercel/analytics/server'
import type {
  AnalyticsEventProperties,
  AnalyticsPrimitive,
  ServerAnalyticsEventName,
} from '@/lib/analytics/events'
import { siteConfig } from '@/lib/config'

/**
 * Records authoritative outcomes without letting an analytics outage change
 * the result of the underlying signup, preference update, or Bell reply.
 */
export async function trackServerEvent<Name extends ServerAnalyticsEventName>(
  request: Request | null,
  name: Name,
  properties: AnalyticsEventProperties[Name]
): Promise<void> {
  if (process.env.NODE_ENV === 'test') return

  try {
    await track(
      name,
      properties as Record<string, AnalyticsPrimitive>,
      request
        ? { request }
        : {
            // Workflows have no browser request context. Supply a neutral,
            // first-party origin so SMS outcomes can still be counted without
            // inventing a visitor, location, cookie, or conversation URL.
            headers: {
              referer: siteConfig.url,
              'user-agent': 'Bell background job',
              'x-forwarded-for': '0.0.0.0',
              cookie: '',
            },
          }
    )
  } catch {
    console.error(`[analytics] Could not record ${name}`)
  }
}
