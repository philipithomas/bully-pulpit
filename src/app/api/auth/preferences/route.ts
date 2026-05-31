import { NextResponse } from 'next/server'
import { clearSessionCookies, getSession } from '@/lib/auth/jwt'
import {
  deleteWithData,
  findByUuid,
  prefsFromBody,
  serializeSubscriber,
  updateSubscriber,
} from '@/lib/db/queries/subscribers'

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

  const body = await request.json()
  const subscriber = await updateSubscriber(session.uuid, prefsFromBody(body))
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
