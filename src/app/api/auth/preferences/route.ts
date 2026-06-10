import { NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { clearSessionCookies, getSession } from '@/lib/auth/jwt'
import {
  deleteWithData,
  findByUuid,
  prefsFromBody,
  serializeSubscriber,
  updateSubscriber,
} from '@/lib/db/queries/subscribers'

// Mirrors the shape prefsFromBody/updateSubscriber consume: booleans for the
// newsletter flags, an optional name, and no unknown keys.
const preferencesSchema = z.strictObject({
  name: z.string().optional(),
  subscribed_postcard: z.boolean().optional(),
  subscribed_contraption: z.boolean().optional(),
  subscribed_workshop: z.boolean().optional(),
})

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const subscriber = await findByUuid(session.uuid)
  if (!subscriber) {
    return NextResponse.json(
      { error: 'Failed to load preferences' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    email: subscriber.email,
    subscribed_contraption: subscriber.subscribedContraption,
    subscribed_workshop: subscriber.subscribedWorkshop,
    subscribed_postcard: subscriber.subscribedPostcard,
  })
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) {
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
  const subscriber = await updateSubscriber(
    session.uuid,
    prefsFromBody(parsed.data)
  )
  if (!subscriber) {
    return NextResponse.json({ error: 'Update failed' }, { status: 404 })
  }

  return NextResponse.json({ subscriber: serializeSubscriber(subscriber) })
}

export async function DELETE() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const subscriber = await findByUuid(session.uuid)
  if (subscriber) {
    await deleteWithData(subscriber.id)
  }

  const response = NextResponse.json({ ok: true })
  clearSessionCookies(response)
  return response
}
