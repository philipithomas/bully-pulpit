import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/auth/admin'
import { getPostBySlug } from '@/lib/content/loader'
import { isNewsletter } from '@/lib/db/queries/subscribers'
import {
  sendNewsletterSmsToTestRecipient,
  sendNewsletterToOne,
} from '@/lib/email/send'
import { isNewsletterSendingEnabled } from '@/lib/newsletters'

export async function POST(request: Request) {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { slug } = body
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }
  const channel = body.channel ?? 'email'
  if (channel !== 'email' && channel !== 'sms') {
    return NextResponse.json(
      { error: 'channel must be email or sms' },
      { status: 400 }
    )
  }

  const post = getPostBySlug(slug)
  if (!post || !isNewsletter(post.newsletter)) {
    return NextResponse.json(
      { error: 'Not a sendable newsletter post' },
      { status: 404 }
    )
  }
  if (!isNewsletterSendingEnabled(post.newsletter)) {
    return NextResponse.json(
      { error: 'This newsletter is archived and cannot be sent.' },
      { status: 409 }
    )
  }

  try {
    if (channel === 'sms') {
      const result = await sendNewsletterSmsToTestRecipient({ slug })
      return NextResponse.json({
        ok: true,
        channel,
        sentTo: result.sentTo,
      })
    }

    await sendNewsletterToOne({ email: session.email, slug })
    return NextResponse.json({ ok: true, channel, sentTo: session.email })
  } catch (err) {
    console.error('[admin/send-test] error:', err)
    const message = err instanceof Error ? err.message : 'Test send failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
