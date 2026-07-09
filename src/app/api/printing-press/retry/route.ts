import { NextResponse } from 'next/server'
import { start } from 'workflow/api'
import { guardAdmin } from '@/lib/auth/admin'
import { getPostBySlug } from '@/lib/content/loader'
import { resetFailedBySlug } from '@/lib/db/queries/email-sends'
import { recordSendRun } from '@/lib/db/queries/send-runs'
import { resetFailedSmsBySlug } from '@/lib/db/queries/sms-sends'
import { isNewsletter } from '@/lib/db/queries/subscribers'
import { isSendRunActive } from '@/lib/email/send-guard'
import { isNewsletterSendingEnabled } from '@/lib/newsletters'
import { sendNewsletterWorkflow } from '@/workflows/send-newsletter'

/**
 * Resumes/retries a send: clears send_error on failed rows (back to pending),
 * then starts the workflow which drains all pending rows for the slug. This is
 * the designed recovery path for a stalled send (run died with rows still
 * pending), so it must NOT refuse just because rows are pending.
 *
 * Mirrors the Send route's guard: it refuses only while a real workflow run is
 * still in flight (isSendRunActive checks run status, not pending rows), which
 * is the only case a second run would race the first over the same rows.
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
    if (!isNewsletterSendingEnabled(post.newsletter)) {
      return NextResponse.json(
        { error: 'This newsletter is archived and cannot be sent.' },
        { status: 409 }
      )
    }

    // Guard against racing an in-flight run: refuse only while a real workflow
    // run is still live. A stalled send (run dead, rows still pending) falls
    // through so retry can resume it. See isSendRunActive.
    if (await isSendRunActive(slug)) {
      return NextResponse.json(
        { error: 'A send for this post is already in progress.' },
        { status: 409 }
      )
    }

    const [resetEmail, resetSms] = await Promise.all([
      resetFailedBySlug(slug),
      resetFailedSmsBySlug(slug),
    ])
    const run = await start(sendNewsletterWorkflow, [slug])
    await recordSendRun(slug, run.runId)
    return NextResponse.json({
      ok: true,
      reset: resetEmail + resetSms,
      runId: run.runId,
    })
  } catch (err) {
    console.error('[printing-press/retry] error:', err)
    return NextResponse.json({ error: 'Retry failed' }, { status: 500 })
  }
}
