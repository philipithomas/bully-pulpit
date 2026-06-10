import { NextResponse } from 'next/server'
import { start } from 'workflow/api'
import { guardAdmin } from '@/lib/auth/admin'
import { getPostBySlug } from '@/lib/content/loader'
import { resetFailedBySlug } from '@/lib/db/queries/email-sends'
import { recordSendRun } from '@/lib/db/queries/send-runs'
import { isNewsletter } from '@/lib/db/queries/subscribers'
import { isSendRunActive } from '@/lib/email/send-guard'
import { sendNewsletterWorkflow } from '@/workflows/send-newsletter'

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

    // Guard against a double-send: refuse only while a real workflow run is
    // still in flight. Checking run status (not pending email_sends rows) means
    // a stalled send whose run already died can be taken over rather than
    // blocked forever. See isSendRunActive.
    if (await isSendRunActive(slug)) {
      return NextResponse.json(
        { error: 'A send for this post is already in progress.' },
        { status: 409 }
      )
    }

    // Heal previously-errored rows in place (clears send_error → pending) so
    // the workflow resends those existing rows rather than inserting duplicate
    // email_sends rows for the same subscriber+post. Mirrors the Retry path.
    await resetFailedBySlug(slug)

    const run = await start(sendNewsletterWorkflow, [slug])
    await recordSendRun(slug, run.runId)
    return NextResponse.json({ ok: true, runId: run.runId })
  } catch (err) {
    console.error('[printing-press/send] error:', err)
    return NextResponse.json({ error: 'Send failed' }, { status: 500 })
  }
}
