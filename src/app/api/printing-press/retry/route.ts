import { NextResponse } from 'next/server'
import { start } from 'workflow/api'
import { guardAdmin } from '@/lib/auth/admin'
import { getPostBySlug } from '@/lib/content/loader'
import {
  countPendingBySlug,
  resetFailedBySlug,
} from '@/lib/db/queries/email-sends'
import { isNewsletter } from '@/lib/db/queries/subscribers'
import { sendNewsletterWorkflow } from '@/workflows/send-newsletter'

/**
 * Resumes/retries a send: clears send_error on failed rows (back to pending),
 * then starts the workflow which drains all pending rows for the slug.
 *
 * Mirrors the Send route's guards: a retry while rows are still pending would
 * start a second workflow run racing the in-flight one over the same rows
 * (the client-side canRetry flag resets on a page reload mid-blast, so the
 * server must refuse). Pending is checked BEFORE healing failed rows, since
 * the heal itself creates pending rows.
 */
export async function POST(request: Request) {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }
    const { slug } = body
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

    // Guard against racing an in-flight send: refuse while rows are pending.
    if ((await countPendingBySlug(slug)) > 0) {
      return NextResponse.json(
        { error: 'A send for this post is already in progress.' },
        { status: 409 }
      )
    }

    const reset = await resetFailedBySlug(slug)
    const run = await start(sendNewsletterWorkflow, [slug])
    return NextResponse.json({ ok: true, reset, runId: run.runId })
  } catch (err) {
    console.error('[printing-press/retry] error:', err)
    return NextResponse.json({ error: 'Retry failed' }, { status: 500 })
  }
}
