import { type NextRequest, NextResponse } from 'next/server'
import {
  findByUnsubscribeToken,
  markUnsubscribed,
} from '@/lib/db/queries/email-sends'
import {
  findById,
  maskEmail,
  prefsFromBody,
  type SubscriberPrefs,
  updateSubscriber,
} from '@/lib/db/queries/subscribers'

const NOT_FOUND = NextResponse.json(
  { error: 'Invalid or expired token' },
  { status: 404 }
)

async function resolveSubscriber(token: string) {
  const emailSend = await findByUnsubscribeToken(token)
  if (!emailSend) return null
  const subscriber = await findById(emailSend.subscriberId)
  if (!subscriber) return null
  return { emailSend, subscriber }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const resolved = await resolveSubscriber(token)
  if (!resolved) return NOT_FOUND

  return NextResponse.json({
    email: maskEmail(resolved.subscriber.email),
    newsletter: resolved.emailSend.newsletter,
    subscribed_postcard: resolved.subscriber.subscribedPostcard,
    subscribed_contraption: resolved.subscriber.subscribedContraption,
    subscribed_workshop: resolved.subscriber.subscribedWorkshop,
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const resolved = await resolveSubscriber(token)
  if (!resolved) return NOT_FOUND

  const body = await request.json()
  await updateSubscriber(resolved.subscriber.uuid, prefsFromBody(body))
  return NextResponse.json({ success: true })
}

/**
 * Unsubscribes from ALL newsletters. The unsubscribe token lives in the
 * recipient's email (and List-Unsubscribe headers), so it can opt someone out of
 * everything — but it deliberately does NOT delete account data. Irreversible
 * deletion is gated behind an authenticated session (/account → DELETE
 * /api/auth/preferences) so a leaked token can't nuke an account.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const resolved = await resolveSubscriber(token)
  if (!resolved) return NOT_FOUND

  await updateSubscriber(resolved.subscriber.uuid, {
    subscribedPostcard: false,
    subscribedContraption: false,
    subscribedWorkshop: false,
  })
  await markUnsubscribed(resolved.emailSend.id)
  return NextResponse.json({ success: true })
}

/** Maps the email's newsletter to an unsubscribe-from-that-newsletter update. */
function unsubscribeUpdate(newsletter: string | null): SubscriberPrefs {
  switch (newsletter) {
    case 'postcard':
      return { subscribedPostcard: false }
    case 'contraption':
      return { subscribedContraption: false }
    case 'workshop':
      return { subscribedWorkshop: false }
    default:
      return {
        subscribedPostcard: false,
        subscribedContraption: false,
        subscribedWorkshop: false,
      }
  }
}

/** RFC 8058 one-click unsubscribe (the List-Unsubscribe-Post target). */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const resolved = await resolveSubscriber(token)
  if (!resolved) return NOT_FOUND

  await updateSubscriber(
    resolved.subscriber.uuid,
    unsubscribeUpdate(resolved.emailSend.newsletter)
  )
  await markUnsubscribed(resolved.emailSend.id)
  return NextResponse.json({ success: true })
}
