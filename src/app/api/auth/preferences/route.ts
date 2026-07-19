import { NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { parseAnalyticsPlacement } from '@/lib/analytics/events'
import { trackServerEvent } from '@/lib/analytics/server'
import { clearSessionCookies, getVerifiedSession } from '@/lib/auth/jwt'
import { notifyExistingSubscriberOptIns } from '@/lib/auth/subscriber-service'
import {
  deleteWithData,
  prefsFromBody,
  serializeSubscriber,
  serializeSubscriberPreferences,
  updateSubscriber,
} from '@/lib/db/queries/subscribers'

// Mirrors the shape prefsFromBody/updateSubscriber consume: booleans for the
// newsletter flags, an optional name, and no unknown keys.
const preferencesSchema = z.strictObject({
  name: z.string().optional(),
  subscribed_postcard: z.boolean().optional(),
  subscribed_contraption: z.boolean().optional(),
  subscribed_workshop: z.boolean().optional(),
  subscribed_tidbits: z.boolean().optional(),
  analytics_placement: z.string().optional(),
})

const NEWSLETTER_PREFERENCES = [
  {
    requestKey: 'subscribed_contraption',
    databaseKey: 'subscribedContraption',
    newsletter: 'contraption',
  },
  {
    requestKey: 'subscribed_workshop',
    databaseKey: 'subscribedWorkshop',
    newsletter: 'workshop',
  },
  {
    requestKey: 'subscribed_postcard',
    databaseKey: 'subscribedPostcard',
    newsletter: 'postcard',
  },
  {
    requestKey: 'subscribed_tidbits',
    databaseKey: 'subscribedTidbits',
    newsletter: 'tidbits',
  },
] as const

export async function GET() {
  const verified = await getVerifiedSession()
  if (!verified) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(serializeSubscriberPreferences(verified.subscriber))
}

export async function PATCH(request: Request) {
  const verified = await getVerifiedSession()
  if (!verified) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const parsed = preferencesSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid preferences in request body' },
      { status: 400 }
    )
  }
  const before = verified.subscriber

  const subscriber = await updateSubscriber(
    verified.session.uuid,
    prefsFromBody(parsed.data)
  )
  if (!subscriber) {
    return NextResponse.json({ error: 'Update failed' }, { status: 404 })
  }
  await notifyExistingSubscriberOptIns(before, subscriber)

  const placement = parseAnalyticsPlacement(parsed.data.analytics_placement)
  await Promise.all(
    NEWSLETTER_PREFERENCES.flatMap((preference) => {
      const requested = parsed.data[preference.requestKey]
      if (
        requested === undefined ||
        before[preference.databaseKey] === subscriber[preference.databaseKey]
      ) {
        return []
      }
      return [
        trackServerEvent(request, 'Newsletter preference changed', {
          placement,
          newsletter: preference.newsletter,
          subscribed: subscriber[preference.databaseKey],
        }),
      ]
    })
  )

  return NextResponse.json({
    subscriber: serializeSubscriber(subscriber),
    preferences: serializeSubscriberPreferences(subscriber),
  })
}

export async function DELETE() {
  const verified = await getVerifiedSession()
  if (!verified) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await deleteWithData(verified.subscriber.id)

  const response = NextResponse.json({ ok: true })
  clearSessionCookies(response)
  return response
}
