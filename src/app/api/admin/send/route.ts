import { NextResponse } from 'next/server'
import { start } from 'workflow/api'
import { guardAdmin } from '@/lib/auth/admin'
import { getPostBySlug } from '@/lib/content/loader'
import { countPendingBySlug } from '@/lib/db/queries/email-sends'
import { isNewsletter } from '@/lib/db/queries/subscribers'
import { sendNewsletterWorkflow } from '@/workflows/send-newsletter'

export async function POST(request: Request) {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { slug } = await request.json()
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }

  const post = getPostBySlug(slug)
  if (!post || !isNewsletter(post.newsletter)) {
    return NextResponse.json(
      { error: 'Not a sendable newsletter post' },
      { status: 404 }
    )
  }

  // Guard against a double-send: refuse if a batch is already in flight.
  if ((await countPendingBySlug(slug)) > 0) {
    return NextResponse.json(
      { error: 'A send for this post is already in progress.' },
      { status: 409 }
    )
  }

  const run = await start(sendNewsletterWorkflow, [slug])
  return NextResponse.json({ ok: true, runId: run.runId })
}
