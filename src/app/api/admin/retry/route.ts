import { NextResponse } from 'next/server'
import { start } from 'workflow/api'
import { guardAdmin } from '@/lib/auth/admin'
import { resetFailedBySlug } from '@/lib/db/queries/email-sends'
import { sendNewsletterWorkflow } from '@/workflows/send-newsletter'

/**
 * Resumes/retries a send: clears send_error on failed rows (back to pending),
 * then starts the workflow which drains all pending rows for the slug.
 */
export async function POST(request: Request) {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { slug } = await request.json()
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }

  const reset = await resetFailedBySlug(slug)
  const run = await start(sendNewsletterWorkflow, [slug])
  return NextResponse.json({ ok: true, reset, runId: run.runId })
}
